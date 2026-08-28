from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import chess
import chess.pgn

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "openings.yaml"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")


class CatalogError(ValueError):
    """Raised when catalog data is unsafe or inconsistent."""


@dataclass(frozen=True)
class CatalogStats:
    total: int
    white: int
    black: int
    fun: int


def load_catalog(path: Path = DEFAULT_CATALOG, *, require_scores: bool = False) -> dict[str, Any]:
    """Load JSON-compatible YAML without executing arbitrary YAML tags."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"無法讀取開局資料：{exc}") from exc
    validate_catalog(data, require_scores=require_scores)
    return data


def validate_catalog(data: dict[str, Any], *, require_scores: bool = True) -> CatalogStats:
    if data.get("schema_version") != 1 or not isinstance(data.get("openings"), list):
        raise CatalogError("openings.yaml schema_version 必須是 1")
    openings = data["openings"]
    ids: set[str] = set()
    counts = {"白方": 0, "黑方": 0}
    fun = 0
    for item in openings:
        required = {
            "id", "title_zh", "title_en", "side", "eco", "first_move",
            "styles", "difficulty", "mainline", "variations", "ideas",
            "plans", "mistakes", "source",
        }
        missing = required - item.keys()
        if missing:
            raise CatalogError(f"{item.get('id', '?')} 缺少欄位：{sorted(missing)}")
        opening_id = item["id"]
        if not isinstance(opening_id, str) or not ID_RE.fullmatch(opening_id):
            raise CatalogError(f"不安全的 Opening ID：{opening_id!r}")
        if opening_id in ids:
            raise CatalogError(f"重複 Opening ID：{opening_id}")
        ids.add(opening_id)
        if item["side"] not in counts:
            raise CatalogError(f"{opening_id} 的陣營無效")
        if require_scores:
            score_fields = {
                "popularity_pct", "popularity_games", "advantage_pct",
                "evaluation_cp", "evaluation_depth",
            }
            score_missing = score_fields - item.keys()
            if score_missing:
                raise CatalogError(f"{opening_id} 缺少評分欄位：{sorted(score_missing)}")
            for field in ("popularity_pct", "advantage_pct"):
                value = item[field]
                if type(value) is not int or not 0 <= value <= 100:
                    raise CatalogError(f"{opening_id} 的 {field} 必須是 0–100 整數")
            if type(item["popularity_games"]) is not int or item["popularity_games"] < 0:
                raise CatalogError(f"{opening_id} 的 popularity_games 無效")
            if type(item["evaluation_cp"]) is not int:
                raise CatalogError(f"{opening_id} 的 evaluation_cp 必須是整數")
            if item["evaluation_depth"] != 18:
                raise CatalogError(f"{opening_id} 的 evaluation_depth 必須是 18")
        counts[item["side"]] += 1
        if item.get("category") == "趣味":
            fun += 1
        if not isinstance(item["variations"], list) or len(item["variations"]) > 3:
            raise CatalogError(f"{opening_id} 的官方重點變例必須是零至三條")
        _validate_pgn_line(item["mainline"], f"{opening_id} 主線")
        plies = _line_plies(item["mainline"])
        if not 1 <= plies <= 60:
            raise CatalogError(f"{opening_id} 官方辨識棋路長度無效，目前為 {plies / 2:g} 回合")
        source = item["source"]
        if source.get("pgn") != item["mainline"]:
            raise CatalogError(f"{opening_id} 主線與官方來源 PGN 不一致")
        if source.get("epd") != " ".join(_validate_pgn_line(item["mainline"], f"{opening_id} 主線").fen().split()[:4]):
            raise CatalogError(f"{opening_id} 主線與官方來源 EPD 不一致")
        lines = [variation["line"] for variation in item["variations"]]
        names = [variation["name"] for variation in item["variations"]]
        if len(lines) != len(set(lines)):
            raise CatalogError(f"{opening_id} 含重複變例")
        if len(names) != len(set(names)):
            raise CatalogError(f"{opening_id} 含重複變例名稱")
        for variation in item["variations"]:
            if variation["line"] == item["mainline"]:
                raise CatalogError(f"{opening_id} 把主線重複列為變例")
            source_name = source.get("name", "")
            source_short_name = source_name.split(":", 1)[-1].strip()
            generic_names = {
                item["title_en"].casefold(),
                source_name.casefold(),
                source_short_name.casefold(),
            }
            if variation["name"].casefold() in generic_names:
                raise CatalogError(f"{opening_id} 把未命名辨識前綴列為變例")
            _validate_pgn_line(variation["line"], f"{opening_id}/{variation['name']}")
    stats = CatalogStats(len(openings), counts["白方"], counts["黑方"], fun)
    if stats != CatalogStats(total=196, white=98, black=98, fun=39):
        raise CatalogError(f"卡片配額不符：{stats}")
    if require_scores:
        _validate_scoring(data)
    return stats


def _validate_scoring(data: dict[str, Any]) -> None:
    metadata = data.get("scoring")
    if not isinstance(metadata, dict):
        raise CatalogError("缺少 scoring 評分來源 metadata")
    try:
        date.fromisoformat(metadata["updated_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise CatalogError("scoring.updated_at 必須是 ISO 日期") from exc

    popularity = metadata.get("popularity", {})
    expected_popularity = {
        "source": "Lichess Opening Explorer",
        "ratings": [1000, 1200, 1400, 1600],
        "speeds": ["blitz", "rapid", "classical"],
        "recognition_plies": 8,
        "formula": "round(100 * log1p(games) / log1p(max_games))",
    }
    for key, expected in expected_popularity.items():
        if popularity.get(key) != expected:
            raise CatalogError(f"scoring.popularity.{key} 不符合評分規格")

    advantage = metadata.get("advantage", {})
    if not isinstance(advantage.get("engine"), str) or not advantage["engine"].strip():
        raise CatalogError("scoring.advantage.engine 不可空白")
    expected_advantage = {
        "depth": 18,
        "perspective": "card side",
        "formula": "round(100 / (1 + 10 ** (-cp / 400)))",
    }
    for key, expected in expected_advantage.items():
        if advantage.get(key) != expected:
            raise CatalogError(f"scoring.advantage.{key} 不符合評分規格")

    openings = data["openings"]
    maximum = max(item["popularity_games"] for item in openings)
    denominator = math.log1p(maximum) if maximum > 0 else None
    for item in openings:
        expected_popularity_pct = (
            round(100 * math.log1p(item["popularity_games"]) / denominator)
            if denominator else 0
        )
        if item["popularity_pct"] != expected_popularity_pct:
            raise CatalogError(f"{item['id']} 的 popularity_pct 與 popularity_games 不一致")

        cp = item["evaluation_cp"]
        if cp >= 100_000:
            white_percent = 100
        elif cp <= -100_000:
            white_percent = 0
        else:
            bounded = max(-4000, min(4000, cp))
            white_percent = round(100 / (1 + 10 ** (-bounded / 400)))
        expected_advantage_pct = white_percent if item["side"] == "白方" else 100 - white_percent
        if item["advantage_pct"] != expected_advantage_pct:
            raise CatalogError(f"{item['id']} 的 advantage_pct 與 evaluation_cp／陣營不一致")


def _validate_pgn_line(line: str, label: str) -> chess.Board:
    game = chess.pgn.read_game(__import__("io").StringIO(f"[Result \"*\"]\n\n{line} *"))
    if game is None or game.errors:
        raise CatalogError(f"{label} 不是合法 PGN：{game.errors if game else '空白'}")
    board = game.board()
    for move in game.mainline_moves():
        if move not in board.legal_moves:
            raise CatalogError(f"{label} 含不合法棋步")
        board.push(move)
    return board


def board_for_line(line: str) -> chess.Board:
    return _validate_pgn_line(line, "棋譜")


def _line_plies(line: str) -> int:
    game = chess.pgn.read_game(__import__("io").StringIO(f"[Result \"*\"]\n\n{line} *"))
    return sum(1 for _ in game.mainline_moves()) if game else 0


def item_by_id(data: dict[str, Any], opening_id: str) -> dict[str, Any] | None:
    if not ID_RE.fullmatch(opening_id):
        return None
    return next((item for item in data["openings"] if item["id"] == opening_id), None)
