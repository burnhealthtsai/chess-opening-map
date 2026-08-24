from __future__ import annotations

import hashlib
import io
import json
import re
from pathlib import Path
from typing import Any

import chess.pgn

from .catalog import CatalogError, ROOT

DEFAULT_VARIATIONS = ROOT / "variations.json"
VARIATION_ID_RE = re.compile(r"^v-[a-e][0-9]{2}-[a-z0-9][a-z0-9-]{2,55}$")


def stable_variation_id(eco: str, name: str, line: str) -> str:
    normalized = name.lower().replace("'", "")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")[:36] or "line"
    digest = hashlib.blake2s(f"{eco}\0{name}\0{line}".encode(), digest_size=5).hexdigest()
    return f"v-{eco.lower()}-{slug}-{digest}"


def load_variations(path: Path = DEFAULT_VARIATIONS) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"無法讀取完整變例索引：{exc}") from exc
    validate_variations(data)
    return data


def validate_variations(data: dict[str, Any], *, expected_total: int = 3810) -> None:
    if data.get("schema_version") != 1 or not isinstance(data.get("variations"), list):
        raise CatalogError("variations.json schema_version 必須是 1")
    variations = data["variations"]
    if len(variations) != expected_total:
        raise CatalogError(f"完整變例總數應為 {expected_total}，目前為 {len(variations)}")
    ids: set[str] = set()
    lines: set[str] = set()
    required = {
        "id", "eco", "name", "root_en", "root_zh", "side",
        "opening_id", "line", "plies", "source",
    }
    for item in variations:
        missing = required - item.keys()
        if missing:
            raise CatalogError(f"{item.get('id', '?')} 缺少欄位：{sorted(missing)}")
        variation_id = item["id"]
        if not isinstance(variation_id, str) or not VARIATION_ID_RE.fullmatch(variation_id):
            raise CatalogError(f"不安全的 Variation ID：{variation_id!r}")
        if variation_id in ids:
            raise CatalogError(f"重複 Variation ID：{variation_id}")
        ids.add(variation_id)
        if item["line"] in lines:
            raise CatalogError(f"重複完整棋路：{variation_id}")
        lines.add(item["line"])
        if item["side"] not in ("白方", "黑方"):
            raise CatalogError(f"{variation_id} 的陣營無效")
        game = chess.pgn.read_game(io.StringIO(f"[Result \"*\"]\n\n{item['line']} *"))
        if game is None or game.errors:
            raise CatalogError(f"{variation_id} 含不合法棋路")
        plies = sum(1 for _ in game.mainline_moves())
        if plies != item["plies"] or plies < 1:
            raise CatalogError(f"{variation_id} 的半回合數不符")


def item_by_variation_id(data: dict[str, Any], variation_id: str) -> dict[str, Any] | None:
    if not VARIATION_ID_RE.fullmatch(variation_id):
        return None
    return next((item for item in data["variations"] if item["id"] == variation_id), None)


def build_variation_assets(output_dir: Path | None = None) -> Path:
    data = load_variations()
    output_dir = output_dir or ROOT / "build" / "variation-pgn"
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("*.pgn"):
        stale.unlink()
    for item in data["variations"]:
        (output_dir / f"{item['id']}.pgn").write_text(render_variation_pgn(item), encoding="utf-8")
    return output_dir


def render_variation_pgn(item: dict[str, Any]) -> str:
    game = chess.pgn.read_game(io.StringIO(f"[Result \"*\"]\n\n{item['line']} *"))
    assert game is not None
    game.headers.update({
        "Event": item["name"],
        "Site": "Notion Chess Variation Index",
        "ECO": item["eco"],
        "Result": "*",
        "Annotator": "Lichess chess-openings (CC0-1.0)",
    })
    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    return game.accept(exporter).strip() + "\n"
