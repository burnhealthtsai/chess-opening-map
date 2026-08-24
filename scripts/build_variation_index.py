#!/usr/bin/env python3
"""Build the complete Lichess variation index from the local CC0 TSV snapshot."""
from __future__ import annotations

import csv
import io
import json
import os
import sys
from pathlib import Path

import chess.pgn

from chess_library.catalog import ROOT, load_catalog
from chess_library.variations import stable_variation_id


def main(argv: list[str]) -> int:
    paths = [Path(value) for value in argv] if argv else [Path(f"/private/tmp/chess-openings-{c}.tsv") for c in "abcde"]
    openings = load_catalog()["openings"]
    exact = {item["title_en"]: item for item in openings}
    by_root: dict[str, dict] = {}
    for item in openings:
        by_root.setdefault(item["title_en"].split(":", 1)[0], item)

    rows: list[dict[str, str]] = []
    for path in paths:
        with path.open(encoding="utf-8", newline="") as handle:
            rows.extend(csv.DictReader(handle, delimiter="\t"))

    variations = []
    for row in rows:
        root = row["name"].split(":", 1)[0]
        parent = exact.get(root) or by_root.get(root)
        if parent is None:
            raise RuntimeError(f"找不到主開局卡：{root}")
        game = chess.pgn.read_game(io.StringIO(f"[Result \"*\"]\n\n{row['pgn']} *"))
        if game is None or game.errors:
            raise RuntimeError(f"不合法棋路：{row['name']}")
        variations.append({
            "id": stable_variation_id(row["eco"], row["name"], row["pgn"]),
            "eco": row["eco"],
            "name": row["name"],
            "root_en": root,
            "root_zh": parent["title_zh"],
            "side": parent["side"],
            "opening_id": parent["id"],
            "line": row["pgn"],
            "plies": sum(1 for _ in game.mainline_moves()),
            "source": "lichess-org/chess-openings CC0-1.0",
        })
    variations.sort(key=lambda item: (item["eco"], item["name"], item["line"]))
    data = {
        "schema_version": 1,
        "source": "lichess-org/chess-openings (CC0-1.0)",
        "variations": variations,
    }
    output = Path(os.environ.get("CHESS_VARIATIONS_OUTPUT", ROOT / "variations.json"))
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(variations)} complete variations to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
