from __future__ import annotations

import html
from pathlib import Path

import chess
import chess.pgn
import chess.svg

from .catalog import ROOT, board_for_line, load_catalog


def build_assets(output_dir: Path | None = None) -> Path:
    data = load_catalog()
    output_dir = output_dir or ROOT / "build"
    pgn_dir = output_dir / "pgn"
    cover_dir = output_dir / "covers"
    pgn_dir.mkdir(parents=True, exist_ok=True)
    cover_dir.mkdir(parents=True, exist_ok=True)
    for stale in pgn_dir.glob("*.pgn"):
        stale.unlink()
    for stale in cover_dir.glob("*.svg"):
        stale.unlink()
    for item in data["openings"]:
        (pgn_dir / f"{item['id']}.pgn").write_text(render_pgn(item), encoding="utf-8")
        board = board_for_line(item["mainline"])
        orientation = chess.WHITE if item["side"] == "白方" else chess.BLACK
        svg = chess.svg.board(
            board=board,
            orientation=orientation,
            size=960,
            coordinates=True,
            colors={"square light": "#f0d9b5", "square dark": "#739552"},
        )
        title = html.escape(f"{item['title_zh']} · {item['title_en']}")
        svg = svg.replace("</svg>", f'<title>{title}</title></svg>')
        (cover_dir / f"{item['id']}.svg").write_text(svg, encoding="utf-8")
    return output_dir


def render_pgn(item: dict) -> str:
    game = chess.pgn.read_game(__import__("io").StringIO(f"[Result \"*\"]\n\n{item['mainline']} *"))
    assert game is not None
    game.headers.update({
        "Event": f"{item['title_zh']} · {item['title_en']}",
        "Site": "Notion Chess Library",
        "ECO": item["eco"],
        "Result": "*",
        "Annotator": "Notion Chess Library",
    })
    def export(current: chess.pgn.Game) -> str:
        # StringExporter accumulates visited games, so each standalone game
        # needs a fresh exporter or earlier games are duplicated in the file.
        return current.accept(chess.pgn.StringExporter(headers=True, variations=True, comments=True))

    chunks = [export(game)]
    for variation in item["variations"]:
        extra = chess.pgn.read_game(__import__("io").StringIO(f"[Result \"*\"]\n\n{variation['line']} *"))
        if extra:
            extra.headers.update({"Event": f"{item['title_en']} — {variation['name']}", "ECO": item["eco"], "Result": "*"})
            chunks.append(export(extra))
    return "\n\n".join(chunks).strip() + "\n"
