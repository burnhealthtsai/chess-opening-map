#!/usr/bin/env python3
"""Replace generic recognition prefixes with named Lichess variation rows."""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from chess_library.catalog import validate_catalog  # noqa: E402
from chess_library.teaching import variation_note  # noqa: E402
from scripts.build_catalog import (  # noqa: E402
    BLACK,
    BLACK_ALL_FAMILIES,
    EXCLUDED_VARIATION_NAMES,
    WHITE,
    WHITE_ALL_FAMILIES,
    make_item,
    read_rows,
)


def refresh_named_variations(catalog: dict[str, Any], generated: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    refreshed = copy.deepcopy(catalog)
    removed = 0
    replaced = 0
    affected = 0
    for opening in refreshed["openings"]:
        source_name = opening["source"]["name"]
        source_short_name = source_name.split(":", 1)[-1].strip()
        generic_names = {
            opening["title_en"].casefold(),
            source_name.casefold(),
            source_short_name.casefold(),
        }
        excluded_names = {
            candidate.casefold()
            for name in EXCLUDED_VARIATION_NAMES.get(opening["title_en"], set())
            for candidate in (name, name.split(":", 1)[-1].strip())
        }
        invalid_names = generic_names | excluded_names
        retained = []
        retained_names: set[str] = set()
        replace_count = 0
        for variation in opening["variations"]:
            variation_name = variation["name"].casefold()
            if variation_name in invalid_names or variation_name in retained_names:
                replace_count += 1
                continue
            retained.append(variation)
            retained_names.add(variation_name)
        retained_lines = {variation["line"] for variation in retained}
        slots = 3 - len(retained)
        options = [
            variation for variation in generated[opening["id"]]["variations"]
            if variation["name"].casefold() not in invalid_names
            and variation["name"].casefold() not in retained_names
            and variation["line"] != opening["mainline"]
            and variation["line"] not in retained_lines
        ][:slots]
        if not replace_count and not options:
            continue
        affected += 1
        named = [{
            "name": variation["name"],
            "line": variation["line"],
            "note": variation_note(opening["title_zh"], opening["mainline"], variation["name"], variation["line"]),
        } for variation in options]
        opening["variations"] = retained + named
        replaced += len(named)
        removed += max(0, replace_count - len(named))
    return refreshed, {"affected_openings": affected, "replaced": replaced, "removed_without_named_source": removed}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tsv", nargs="+", type=Path, help="Lichess chess-openings TSV files")
    parser.add_argument("--catalog", type=Path, default=ROOT / "openings.yaml")
    args = parser.parse_args(argv)
    rows = read_rows(args.tsv)
    picks = WHITE + WHITE_ALL_FAMILIES + BLACK + BLACK_ALL_FAMILIES
    generated = {item["id"]: item for item in (make_item(pick, rows) for pick in picks)}
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    refreshed, stats = refresh_named_variations(catalog, generated)
    validate_catalog(refreshed, require_scores=False)
    temporary = args.catalog.with_suffix(args.catalog.suffix + ".tmp")
    temporary.write_text(json.dumps(refreshed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.catalog)
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
