from __future__ import annotations

import json
import stat
from pathlib import Path
from typing import Any

import chess.pgn

from .catalog import ROOT, validate_catalog
from .scoring import ENGINE_CACHE_PATH, CACHE_PATH, recognition_fen
from .variations import validate_variations


def _json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _asset_check(directory: Path, suffix: str, expected_ids: set[str]) -> dict[str, Any]:
    actual = {path.stem for path in directory.glob(f"*{suffix}")}
    missing = sorted(expected_ids - actual)
    extra = sorted(actual - expected_ids)
    return {
        "status": "complete" if not missing and not extra else "incomplete",
        "expected": len(expected_ids),
        "actual": len(actual),
        "missing": missing,
        "extra": extra,
    }


def _main_pgn_check(directory: Path, expected_ids: set[str]) -> dict[str, Any]:
    result = _asset_check(directory, ".pgn", expected_ids)
    invalid_files: list[str] = []
    duplicate_game_files: list[str] = []
    valid_files = 0
    for opening_id in sorted(expected_ids):
        path = directory / f"{opening_id}.pgn"
        if not path.exists():
            continue
        games: list[tuple[str, ...]] = []
        has_errors = False
        try:
            with path.open(encoding="utf-8") as handle:
                while game := chess.pgn.read_game(handle):
                    has_errors = has_errors or bool(game.errors)
                    games.append(tuple(move.uci() for move in game.mainline_moves()))
        except (OSError, UnicodeError, ValueError):
            has_errors = True
        if has_errors or not 1 <= len(games) <= 4:
            invalid_files.append(path.name)
        elif len(set(games)) != len(games):
            duplicate_game_files.append(path.name)
        else:
            valid_files += 1
    result.update(
        {
            "valid_files": valid_files,
            "invalid_files": invalid_files,
            "duplicate_game_files": duplicate_game_files,
        }
    )
    if invalid_files or duplicate_game_files:
        result["status"] = "incomplete"
    return result


def audit_library(root: Path = ROOT) -> dict[str, Any]:
    catalog = _json(root / "openings.yaml")
    variations = _json(root / "variations.json")
    validate_catalog(catalog, require_scores=False)
    validate_variations(variations)
    openings = catalog["openings"]
    complete_variations = variations["variations"]
    opening_ids = {item["id"] for item in openings}
    variation_ids = {item["id"] for item in complete_variations}
    important_variations = [variation for item in openings for variation in item["variations"]]

    teaching = {
        "ideas_unique": len({item["ideas"] for item in openings}),
        "plan_sets_unique": len({tuple(item["plans"]) for item in openings}),
        "mistake_sets_unique": len({tuple(item["mistakes"]) for item in openings}),
        "important_variations": len(important_variations),
        "generic_variation_notes": sum(
            variation["note"] == "比較兵形、子力配置與典型突破時機。"
            for variation in important_variations
        ),
    }
    teaching["status"] = (
        "complete"
        if teaching["ideas_unique"] == len(openings)
        and teaching["plan_sets_unique"] == len(openings)
        and teaching["mistake_sets_unique"] >= 12
        and teaching["generic_variation_notes"] == 0
        else "incomplete"
    )

    score_fields = {
        "popularity_pct", "popularity_games", "advantage_pct",
        "evaluation_cp", "evaluation_depth",
    }
    canonical_scored = sum(score_fields <= item.keys() for item in openings)
    engine_cache = _json(root / ENGINE_CACHE_PATH.relative_to(ROOT))
    popularity_cache = _json(root / CACHE_PATH.relative_to(ROOT))
    engine_cached = len(engine_cache.get("evaluations", {}))
    popularity_cached = len(popularity_cache.get("positions", {}))
    expected_positions = len({recognition_fen(item["mainline"]) for item in openings})
    scoring = {
        "status": "complete" if canonical_scored == len(openings) and engine_cached == len(openings) and popularity_cached == expected_positions else "incomplete",
        "canonical_scored": canonical_scored,
        "engine_cached": engine_cached,
        "popularity_cached": popularity_cached,
        "expected_positions": expected_positions,
    }

    key_path = root / ".notion-chess-key"
    key_mode = stat.S_IMODE(key_path.stat().st_mode) if key_path.exists() else None
    main_receipt = _json(root / "build/notion-import-result.json")
    variation_receipt = _json(root / "build/notion-variation-import-result.json")
    score_receipt = _json(root / "build/notion-score-sync-result.json")
    deployment = {
        "bridge_key_mode": oct(key_mode) if key_mode is not None else None,
        "main_import_status": main_receipt.get("status"),
        "main_import_rows": sum(int(main_receipt.get(key, 0)) for key in ("created", "updated", "skipped")),
        "variation_import_status": variation_receipt.get("status"),
        "variation_import_rows": variation_receipt.get("total", 0),
        "score_sync_status": score_receipt.get("status"),
        "score_sync_rows": score_receipt.get("updated", 0),
    }
    deployment["status"] = (
        "complete"
        if key_mode == 0o600
        and deployment["main_import_status"] == "complete"
        and deployment["main_import_rows"] == len(openings)
        and deployment["variation_import_status"] == "complete"
        and deployment["variation_import_rows"] == len(complete_variations)
        and deployment["score_sync_status"] == "complete"
        and deployment["score_sync_rows"] == len(openings)
        else "incomplete"
    )

    checks: dict[str, Any] = {
        "catalog": {"status": "complete", "total": len(openings), "white": sum(item["side"] == "白方" for item in openings), "black": sum(item["side"] == "黑方" for item in openings)},
        "complete_variations": {"status": "complete", "total": len(complete_variations), "root_openings": len({item["opening_id"] for item in complete_variations})},
        "teaching": teaching,
        "main_pgn": _main_pgn_check(root / "build/pgn", opening_ids),
        "covers": _asset_check(root / "build/covers", ".svg", opening_ids),
        "variation_pgn": _asset_check(root / "build/variation-pgn", ".pgn", variation_ids),
        "scoring": scoring,
        "deployment": deployment,
    }
    missing = [name for name, check in checks.items() if check["status"] != "complete"]
    return {"status": "complete" if not missing else "incomplete", "missing": missing, "checks": checks}
