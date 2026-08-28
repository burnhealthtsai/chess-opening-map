import copy
import unittest
import io
import chess.pgn

from chess_library.catalog import CatalogError, load_catalog, validate_catalog


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_catalog()

    def test_exact_quotas(self):
        stats = validate_catalog(self.data, require_scores=False)
        self.assertEqual((stats.total, stats.white, stats.black, stats.fun), (196, 98, 98, 39))

    def test_ids_and_lines_are_unique(self):
        ids = [x["id"] for x in self.data["openings"]]
        self.assertEqual(len(ids), len(set(ids)))
        for item in self.data["openings"]:
            self.assertLessEqual(len(item["variations"]), 3)
            game = chess.pgn.read_game(io.StringIO('[Result "*"]\n\n' + item["mainline"] + ' *'))
            self.assertGreaterEqual(sum(1 for _ in game.mainline_moves()), 1)
            self.assertEqual(len({x["line"] for x in item["variations"]}), len(item["variations"]))
            self.assertNotIn(item["mainline"], {x["line"] for x in item["variations"]})

    def test_every_line_matches_its_official_recognition_position(self):
        for item in self.data["openings"]:
            game = chess.pgn.read_game(io.StringIO('[Result "*"]\n\n' + item["mainline"] + ' *'))
            self.assertIsNotNone(game)
            self.assertFalse(game.errors)
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
            self.assertEqual(" ".join(board.fen().split()[:4]), item["source"]["epd"])
            self.assertEqual(item["mainline"], item["source"]["pgn"])

    def test_old_indian_uses_the_family_recognition_line(self):
        item = next(x for x in self.data["openings"] if x["id"] == "b-old-indian-defense")
        self.assertEqual(item["mainline"], "1. d4 Nf6 2. c4 d6")
        self.assertEqual(item["source"]["name"], "Old Indian Defense")
        self.assertNotIn("Bf5", item["mainline"])

    def test_scotch_variations_are_named_continuations_not_recognition_prefixes(self):
        item = next(x for x in self.data["openings"] if x["id"] == "w-scotch-game")
        self.assertEqual(
            [variation["name"] for variation in item["variations"]],
            ["Classical Variation", "Schmidt Variation", "Steinitz Variation"],
        )
        self.assertTrue(all(variation["line"].startswith(item["mainline"] + " ") for variation in item["variations"]))

    def test_every_opening_has_valid_scoring_fields(self):
        if "popularity_pct" not in self.data["openings"][0]:
            self.skipTest("等待 Lichess 常用度寫入正式 catalog")
        for item in self.data["openings"]:
            for field in ("popularity_pct", "advantage_pct"):
                self.assertIs(type(item[field]), int)
                self.assertTrue(0 <= item[field] <= 100)
            self.assertGreaterEqual(item["popularity_games"], 0)
            self.assertIs(type(item["evaluation_cp"]), int)
            self.assertEqual(item["evaluation_depth"], 18)
        validate_catalog(self.data)

    def test_scoring_metadata_and_derived_values_are_validated(self):
        scored = copy.deepcopy(self.data)
        for item in scored["openings"]:
            item.update({
                "popularity_pct": 0,
                "popularity_games": 0,
                "advantage_pct": 50,
                "evaluation_cp": 0,
                "evaluation_depth": 18,
            })
        scored["scoring"] = {
            "updated_at": "2026-08-11",
            "popularity": {
                "source": "Lichess Opening Explorer",
                "ratings": [1000, 1200, 1400, 1600],
                "speeds": ["blitz", "rapid", "classical"],
                "recognition_plies": 8,
                "formula": "round(100 * log1p(games) / log1p(max_games))",
            },
            "advantage": {
                "engine": "Stockfish 18",
                "depth": 18,
                "perspective": "card side",
                "formula": "round(100 / (1 + 10 ** (-cp / 400)))",
            },
        }

        validate_catalog(scored)
        scored["scoring"]["popularity"]["ratings"] = [2500]
        with self.assertRaisesRegex(CatalogError, "ratings"):
            validate_catalog(scored)

    def test_rejects_path_like_id(self):
        changed = {**self.data, "openings": [dict(x) for x in self.data["openings"]]}
        changed["openings"][0]["id"] = "../unsafe"
        with self.assertRaises(CatalogError):
            validate_catalog(changed)


if __name__ == "__main__": unittest.main()
