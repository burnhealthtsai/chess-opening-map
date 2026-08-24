import tempfile
import unittest
from pathlib import Path

import chess.pgn

from chess_library.catalog import load_catalog
from chess_library.generate import build_assets


class GenerateTests(unittest.TestCase):
    def test_builds_all_assets_and_valid_pgn(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = build_assets(Path(tmp))
            self.assertEqual(len(list((output / "covers").glob("*.svg"))), 196)
            self.assertEqual(len(list((output / "pgn").glob("*.pgn"))), 196)
            sample = load_catalog()["openings"][0]
            with (output / "pgn" / f"{sample['id']}.pgn").open() as handle:
                game = chess.pgn.read_game(handle)
            self.assertIsNotNone(game)
            self.assertFalse(game.errors)
            svg = (output / "covers" / f"{sample['id']}.svg").read_text()
            self.assertIn('width="960"', svg)
            self.assertIn("<title>", svg)

            with (output / "pgn" / f"{sample['id']}.pgn").open() as handle:
                games = []
                while game := chess.pgn.read_game(handle):
                    games.append(tuple(game.mainline_moves()))
            self.assertEqual(len(games), 1 + len(sample["variations"]))
            self.assertEqual(len(set(games)), len(games))


if __name__ == "__main__": unittest.main()
