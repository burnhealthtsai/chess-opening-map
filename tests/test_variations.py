import tempfile
import unittest
from pathlib import Path

import chess.pgn

from chess_library.catalog import load_catalog
from chess_library.variations import build_variation_assets, load_variations


class CompleteVariationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_variations()

    def test_complete_counts_and_parent_mapping(self):
        items = self.data["variations"]
        opening_ids = {item["id"] for item in load_catalog()["openings"]}
        self.assertEqual(len(items), 3810)
        self.assertEqual(len({item["id"] for item in items}), 3810)
        self.assertEqual(len({item["name"] for item in items}), 3174)
        self.assertEqual(len({item["line"] for item in items}), 3810)
        self.assertTrue(all(item["opening_id"] in opening_ids for item in items))

    def test_builds_every_variation_pgn(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = build_variation_assets(Path(tmp))
            files = list(output.glob("*.pgn"))
            self.assertEqual(len(files), 3810)
            with files[-1].open() as handle:
                game = chess.pgn.read_game(handle)
            self.assertIsNotNone(game)
            self.assertFalse(game.errors)


if __name__ == "__main__":
    unittest.main()
