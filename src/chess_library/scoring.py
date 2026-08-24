from __future__ import annotations

import io
import hashlib
import json
import math
import os
import random
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Any, Callable

import certifi
import chess
import chess.engine
import chess.pgn

from .catalog import DEFAULT_CATALOG, CatalogError, ROOT, validate_catalog

EXPLORER_URL = "https://explorer.lichess.org/lichess"
RATINGS = (1000, 1200, 1400, 1600)
SPEEDS = ("blitz", "rapid", "classical")
RECOGNITION_PLIES = 8
ENGINE_DEPTH = 18
CACHE_PATH = ROOT / "build" / "opening-popularity-cache.json"
ENGINE_CACHE_PATH = ROOT / "build" / "opening-engine-cache.json"
FORCED_SCORE_CP = 100_000


class ScoringError(RuntimeError):
    pass


def _board_for_line(line: str, max_plies: int | None = None) -> chess.Board:
    game = chess.pgn.read_game(io.StringIO(f'[Result "*"]\n\n{line} *'))
    if game is None or game.errors:
        raise CatalogError(f"評分棋路不是合法 PGN：{game.errors if game else '空白'}")
    board = game.board()
    for index, move in enumerate(game.mainline_moves()):
        if max_plies is not None and index >= max_plies:
            break
        board.push(move)
    return board


def recognition_fen(line: str) -> str:
    return _board_for_line(line, RECOGNITION_PLIES).fen()


def popularity_percentages(game_counts: dict[str, int]) -> dict[str, int]:
    if not game_counts:
        return {}
    maximum = max(game_counts.values())
    if maximum <= 0:
        return {key: 0 for key in game_counts}
    denominator = math.log1p(maximum)
    return {
        key: round(100 * math.log1p(max(0, count)) / denominator)
        for key, count in game_counts.items()
    }


def advantage_percent(white_cp: int, side: str) -> int:
    if side not in ("白方", "黑方"):
        raise ValueError(f"未知陣營：{side}")
    if white_cp >= FORCED_SCORE_CP:
        white_percent = 100
    elif white_cp <= -FORCED_SCORE_CP:
        white_percent = 0
    else:
        bounded = max(-4000, min(4000, white_cp))
        white_percent = round(100 / (1 + 10 ** (-bounded / 400)))
    return white_percent if side == "白方" else 100 - white_percent


def _cache_signature() -> dict[str, Any]:
    return {
        "endpoint": EXPLORER_URL,
        "variant": "standard",
        "ratings": list(RATINGS),
        "speeds": list(SPEEDS),
        "recognition_plies": RECOGNITION_PLIES,
    }


def load_popularity_cache(path: Path = CACHE_PATH) -> dict[str, int]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if payload.get("query") != _cache_signature():
        return {}
    positions = payload.get("positions", {})
    return {
        fen: int(count) for fen, count in positions.items()
        if isinstance(fen, str) and type(count) is int and count >= 0
    }


def save_popularity_cache(positions: dict[str, int], path: Path = CACHE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"query": _cache_signature(), "updated_at": date.today().isoformat(), "positions": positions}
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


class LichessExplorer:
    def __init__(self, token: str | None = None, *, retries: int = 6):
        self.token = (token if token is not None else os.environ.get("LICHESS_TOKEN", "")).strip()
        if not self.token:
            raise ScoringError(
                "Lichess Opening Explorer 自 2026 年起需要登入驗證；"
                "請以環境變數 LICHESS_TOKEN 提供個人存取權杖"
            )
        self.retries = retries
        self.ssl_context = ssl.create_default_context(cafile=certifi.where())

    def game_count(self, fen: str) -> int:
        query = urllib.parse.urlencode({
            "variant": "standard",
            "speeds": ",".join(SPEEDS),
            "ratings": ",".join(str(value) for value in RATINGS),
            "fen": fen,
            "moves": 0,
            "topGames": 0,
            "recentGames": 0,
        })
        request = urllib.request.Request(
            f"{EXPLORER_URL}?{query}",
            headers={
                "Authorization": f"Bearer {self.token}",
                "User-Agent": "notion-chess-library/1.0",
            },
        )
        for attempt in range(self.retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=45, context=self.ssl_context) as response:
                    payload = json.load(response)
                return sum(int(payload.get(key, 0)) for key in ("white", "draws", "black"))
            except urllib.error.HTTPError as exc:
                retryable = exc.code in (429, 500, 502, 503, 504, 529)
                retry_after = float(exc.headers.get("Retry-After", 0) or 0)
                body = exc.read().decode("utf-8", "replace")
                exc.close()
                if not retryable or attempt == self.retries:
                    raise ScoringError(f"Lichess Explorer {exc.code}：{body}") from exc
                time.sleep(retry_after or min(2 ** attempt + random.random(), 20))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                if attempt == self.retries:
                    raise ScoringError(f"Lichess Explorer 網路錯誤：{exc}") from exc
                time.sleep(min(2 ** attempt + random.random(), 20))
        raise AssertionError("unreachable")


def find_stockfish_path() -> Path:
    configured = os.environ.get("STOCKFISH_PATH")
    candidates = [
        Path(configured).expanduser() if configured else None,
        Path.home() / "Library/Application Support/org.encroissant.app/engines/stockfish/stockfish-macos-x86-64-sse41-popcnt",
        Path("/opt/homebrew/bin/stockfish"),
        Path("/usr/local/bin/stockfish"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise ScoringError("找不到 Stockfish；請先在 En Croissant 安裝引擎，或設定 STOCKFISH_PATH")


def _line_digest(line: str) -> str:
    return hashlib.sha256(line.encode("utf-8")).hexdigest()


def _engine_cache_signature(engine_path: Path, depth: int) -> dict[str, Any]:
    stat = engine_path.stat()
    return {
        "path": str(engine_path.resolve()),
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "depth": depth,
    }


def load_engine_cache(
    openings: list[dict[str, Any]],
    engine_path: Path,
    *,
    cache_path: Path = ENGINE_CACHE_PATH,
    depth: int = ENGINE_DEPTH,
) -> tuple[dict[str, int], str]:
    if not cache_path.exists():
        return {}, ""
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, ""
    if payload.get("engine") != _engine_cache_signature(engine_path, depth):
        return {}, ""
    cached = payload.get("evaluations", {})
    evaluations: dict[str, int] = {}
    for item in openings:
        value = cached.get(item["id"], {})
        if value.get("line_sha256") == _line_digest(item["mainline"]) and type(value.get("cp")) is int:
            evaluations[item["id"]] = value["cp"]
    return evaluations, str(payload.get("engine_name", ""))


def save_engine_cache(
    openings: list[dict[str, Any]],
    evaluations: dict[str, int],
    engine_name: str,
    engine_path: Path,
    *,
    cache_path: Path = ENGINE_CACHE_PATH,
    depth: int = ENGINE_DEPTH,
) -> None:
    by_id = {item["id"]: item for item in openings}
    payload = {
        "engine": _engine_cache_signature(engine_path, depth),
        "engine_name": engine_name,
        "updated_at": date.today().isoformat(),
        "evaluations": {
            opening_id: {
                "line_sha256": _line_digest(by_id[opening_id]["mainline"]),
                "cp": cp,
            }
            for opening_id, cp in evaluations.items()
            if opening_id in by_id
        },
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_path.with_suffix(cache_path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(cache_path)


def fetch_popularity_counts(
    fens: set[str],
    *,
    cache_path: Path = CACHE_PATH,
    explorer: LichessExplorer | None = None,
    workers: int = 1,
    progress: Callable[[int, int], None] | None = None,
) -> dict[str, int]:
    counts = load_popularity_cache(cache_path)
    missing = sorted(fens - counts.keys())
    completed = len(fens) - len(missing)
    if progress and completed:
        progress(completed, len(fens))
    if not missing:
        return {fen: counts[fen] for fen in fens}
    explorer = explorer or LichessExplorer()
    # Lichess's official API guidance requires one request at a time.
    with ThreadPoolExecutor(max_workers=1) as executor:
        futures = {executor.submit(explorer.game_count, fen): fen for fen in missing}
        for future in as_completed(futures):
            fen = futures[future]
            counts[fen] = future.result()
            completed += 1
            save_popularity_cache(counts, cache_path)
            if progress:
                progress(completed, len(fens))
    return {fen: counts[fen] for fen in fens}


def evaluate_openings(
    openings: list[dict[str, Any]],
    *,
    engine_path: Path | None = None,
    cache_path: Path = ENGINE_CACHE_PATH,
    depth: int = ENGINE_DEPTH,
    progress: Callable[[int, int], None] | None = None,
) -> tuple[dict[str, int], str]:
    engine_path = engine_path or find_stockfish_path()
    evaluations, cached_engine_name = load_engine_cache(
        openings, engine_path, cache_path=cache_path, depth=depth,
    )
    if len(evaluations) == len(openings):
        if progress:
            progress(len(openings), len(openings))
        return evaluations, cached_engine_name or "Stockfish"
    try:
        engine = chess.engine.SimpleEngine.popen_uci(str(engine_path))
    except (OSError, chess.engine.EngineError) as exc:
        raise ScoringError(f"無法啟動 Stockfish：{exc}") from exc
    try:
        name = engine.id.get("name", "Stockfish")
        for index, item in enumerate(openings, 1):
            if item["id"] in evaluations:
                if progress:
                    progress(index, len(openings))
                continue
            board = _board_for_line(item["mainline"])
            info = engine.analyse(board, chess.engine.Limit(depth=depth))
            white_score = info["score"].pov(chess.WHITE)
            evaluations[item["id"]] = int(white_score.score(mate_score=FORCED_SCORE_CP) or 0)
            save_engine_cache(
                openings, evaluations, name, engine_path,
                cache_path=cache_path, depth=depth,
            )
            if progress:
                progress(index, len(openings))
        return evaluations, name
    except (chess.engine.EngineError, chess.engine.EngineTerminatedError) as exc:
        raise ScoringError(f"Stockfish 評估失敗：{exc}") from exc
    finally:
        engine.quit()


def score_openings(
    catalog_path: Path = DEFAULT_CATALOG,
    *,
    cache_path: Path = CACHE_PATH,
    engine_path: Path | None = None,
) -> dict[str, Any]:
    try:
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"無法讀取開局資料：{exc}") from exc
    validate_catalog(data, require_scores=False)
    openings = data["openings"]
    fens_by_id = {item["id"]: recognition_fen(item["mainline"]) for item in openings}

    def engine_progress(done: int, total: int) -> None:
        if done == total or done % 10 == 0:
            print(f"[優劣程度 {done:03d}/{total}] Stockfish depth {ENGINE_DEPTH}")

    evaluations, engine_name = evaluate_openings(
        openings, engine_path=engine_path, depth=ENGINE_DEPTH, progress=engine_progress,
    )

    def popularity_progress(done: int, total: int) -> None:
        if done == total or done % 10 == 0:
            print(f"[常用度 {done:03d}/{total}] Lichess 局面")

    counts_by_fen = fetch_popularity_counts(
        set(fens_by_id.values()), cache_path=cache_path, progress=popularity_progress,
    )
    popularity_by_fen = popularity_percentages(counts_by_fen)

    for item in openings:
        fen = fens_by_id[item["id"]]
        cp = evaluations[item["id"]]
        item["popularity_pct"] = popularity_by_fen[fen]
        item["popularity_games"] = counts_by_fen[fen]
        item["advantage_pct"] = advantage_percent(cp, item["side"])
        item["evaluation_cp"] = cp
        item["evaluation_depth"] = ENGINE_DEPTH
    data["scoring"] = {
        "updated_at": date.today().isoformat(),
        "popularity": {
            "source": "Lichess Opening Explorer",
            "ratings": list(RATINGS),
            "speeds": list(SPEEDS),
            "recognition_plies": RECOGNITION_PLIES,
            "formula": "round(100 * log1p(games) / log1p(max_games))",
        },
        "advantage": {
            "engine": engine_name,
            "depth": ENGINE_DEPTH,
            "perspective": "card side",
            "formula": "round(100 / (1 + 10 ** (-cp / 400)))",
        },
    }
    validate_catalog(data)
    temporary = catalog_path.with_suffix(catalog_path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(catalog_path)
    return {
        "total": len(openings),
        "unique_positions": len(set(fens_by_id.values())),
        "engine": engine_name,
        "depth": ENGINE_DEPTH,
    }


def cache_engine_scores(
    catalog_path: Path = DEFAULT_CATALOG,
    *,
    cache_path: Path = ENGINE_CACHE_PATH,
    engine_path: Path | None = None,
) -> dict[str, Any]:
    try:
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"無法讀取開局資料：{exc}") from exc
    validate_catalog(data, require_scores=False)

    def progress(done: int, total: int) -> None:
        if done == total or done % 10 == 0:
            print(f"[優劣程度 {done:03d}/{total}] Stockfish depth {ENGINE_DEPTH}")

    evaluations, engine_name = evaluate_openings(
        data["openings"], engine_path=engine_path, cache_path=cache_path,
        depth=ENGINE_DEPTH, progress=progress,
    )
    return {
        "total": len(evaluations),
        "engine": engine_name,
        "depth": ENGINE_DEPTH,
        "cache": str(cache_path),
        "status": "complete",
    }
