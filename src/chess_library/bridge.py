from __future__ import annotations

import hmac
import html
import os
import secrets
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .catalog import DEFAULT_CATALOG, ROOT, item_by_id, load_catalog
from .generate import build_assets
from .variations import DEFAULT_VARIATIONS, item_by_variation_id, load_variations, render_variation_pgn

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
KEY_FILE = ROOT / ".notion-chess-key"


def get_or_create_key(path: Path = KEY_FILE) -> str:
    if path.exists():
        key = path.read_text(encoding="utf-8").strip()
        if len(key) < 32:
            raise ValueError("本機橋接密鑰長度不足")
        return key
    key = secrets.token_urlsafe(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(key + "\n")
    return key


class BridgeServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False

    def __init__(self, address, catalog_path: Path, key: str, opener=None, variation_catalog_path: Path = DEFAULT_VARIATIONS):
        if address[0] not in ("127.0.0.1", "localhost"):
            raise ValueError("橋接器只能綁定 loopback")
        self.catalog = load_catalog(catalog_path)
        self.key = key
        self.pgn_dir = build_assets() / "pgn"
        self.variation_catalog = load_variations(variation_catalog_path)
        self.variation_pgn_dir = ROOT / "build" / "variation-pgn"
        self.variation_pgn_dir.mkdir(parents=True, exist_ok=True)
        self.opener = opener or open_in_en_croissant
        super().__init__(address, BridgeHandler)


class BridgeHandler(BaseHTTPRequestHandler):
    server: BridgeServer

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self._html(HTTPStatus.OK, "橋接器運作正常", "可以從 Notion 開啟棋譜。")
        opening_prefix = "/open/"
        variation_prefix = "/variation/"
        if not parsed.path.startswith((opening_prefix, variation_prefix)):
            return self._html(HTTPStatus.NOT_FOUND, "找不到頁面", "請回到 Notion 再試一次。")
        supplied = parse_qs(parsed.query).get("key", [""])[0]
        if not hmac.compare_digest(supplied, self.server.key):
            return self._html(HTTPStatus.FORBIDDEN, "連結驗證失敗", "請重新執行 Notion 匯入器更新連結。")
        if parsed.path.startswith(variation_prefix):
            variation_id = parsed.path[len(variation_prefix):]
            item = item_by_variation_id(self.server.variation_catalog, variation_id)
            if item is None:
                return self._html(HTTPStatus.NOT_FOUND, "找不到變例", "Variation ID 不存在或格式不安全。")
            pgn_path = (self.server.variation_pgn_dir / f"{variation_id}.pgn").resolve()
            if pgn_path.parent != self.server.variation_pgn_dir.resolve():
                return self._html(HTTPStatus.NOT_FOUND, "找不到變例", "Variation ID 格式不安全。")
            if not pgn_path.is_file():
                pgn_path.write_text(render_variation_pgn(item), encoding="utf-8")
            display_name = item["name"]
        else:
            opening_id = parsed.path[len(opening_prefix):]
            item = item_by_id(self.server.catalog, opening_id)
            if item is None:
                return self._html(HTTPStatus.NOT_FOUND, "找不到開局", "Opening ID 不存在或格式不安全。")
            pgn_path = (self.server.pgn_dir / f"{opening_id}.pgn").resolve()
            if pgn_path.parent != self.server.pgn_dir.resolve() or not pgn_path.is_file():
                return self._html(HTTPStatus.NOT_FOUND, "棋譜尚未生成", "請先執行 chess-library build。")
            display_name = item["title_zh"]
        try:
            self.server.opener(pgn_path)
        except (OSError, subprocess.SubprocessError) as exc:
            return self._html(HTTPStatus.INTERNAL_SERVER_ERROR, "無法開啟 En Croissant", html.escape(str(exc)))
        return self._html(HTTPStatus.OK, "已送往 En Croissant", f"正在開啟：{html.escape(display_name)}")

    def _html(self, status: HTTPStatus, title: str, message: str) -> None:
        body = ("<!doctype html><html lang='zh-Hant'><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width'><title>西洋棋分析</title>"
                "<style>body{font:18px system-ui;max-width:680px;margin:12vh auto;padding:2rem;"
                "background:#f7f4ed;color:#25231f}main{background:white;padding:2rem;border-radius:18px;"
                "box-shadow:0 8px 32px #0002}h1{color:#406343}</style>"
                f"<main><h1>{html.escape(title)}</h1><p>{message}</p></main></html>").encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        # Deliberately omit URLs because they contain the local key.
        print(f"bridge: {self.client_address[0]} {args[1] if len(args) > 1 else ''}")


def open_in_en_croissant(pgn_path: Path) -> None:
    if os.uname().sysname != "Darwin":
        raise OSError("本機橋接目前僅支援 macOS")
    # En Croissant reads its PGN argument only during application startup. It
    # does not register PGN document types on macOS, so `open -a APP FILE`
    # merely focuses an already-running instance without delivering the file.
    # Start a fresh instance and pass the PGN through the app's CLI instead.
    result = subprocess.run(
        ["/usr/bin/open", "-n", "-a", "en-croissant", "--args", str(pgn_path)],
        capture_output=True, text=True, timeout=15, check=False,
    )
    if result.returncode:
        raise OSError(result.stderr.strip() or "請確認 en-croissant.app 已安裝於 Applications")


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, key_file: Path = KEY_FILE) -> None:
    key = get_or_create_key(key_file)
    with BridgeServer((host, port), DEFAULT_CATALOG, key) as server:
        print(f"西洋棋橋接器：http://{host}:{server.server_port}/health")
        server.serve_forever()
