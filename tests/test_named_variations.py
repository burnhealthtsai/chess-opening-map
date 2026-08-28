import copy
import unittest

from scripts.build_catalog import select_rows
from scripts.refresh_named_variations import refresh_named_variations


class NamedVariationRefreshTests(unittest.TestCase):
    def test_select_rows_includes_accepted_and_declined_families(self):
        rows = [
            {"name": "Sample Gambit", "pgn": "1. e4", "eco": "A00"},
            {"name": "Sample Gambit Accepted: Main Line", "pgn": "1. e4 d5", "eco": "A00"},
            {"name": "Sample Gambit Declined: Classical", "pgn": "1. e4 e5", "eco": "A00"},
            {"name": "Unrelated Opening", "pgn": "1. d4", "eco": "A00"},
        ]

        selected = select_rows(rows, "Sample Gambit", "主流")

        self.assertEqual(selected[0]["name"], "Sample Gambit")
        self.assertEqual(
            {row["name"] for row in selected[1:]},
            {"Sample Gambit Accepted: Main Line", "Sample Gambit Declined: Classical"},
        )

    def test_select_rows_excludes_colle_novelty_sidelines(self):
        rows = [
            {"name": "Colle System", "pgn": "1. d4", "eco": "D05"},
            {"name": "Colle System: Pterodactyl Variation", "pgn": "1. d4 g6", "eco": "A40"},
            {"name": "Colle System: Rhamphorhynchus Variation", "pgn": "1. Nf3 c5", "eco": "A04"},
        ]

        selected = select_rows(rows, "Colle System", "主流")

        self.assertEqual([row["name"] for row in selected], ["Colle System"])

    def test_refresh_removes_short_colle_novelty_names(self):
        opening = {
            "id": "w-colle-system",
            "title_zh": "科勒體系",
            "title_en": "Colle System",
            "mainline": "1. d4",
            "variations": [
                {"name": "Traditional Colle", "line": "1. d4 d5", "note": "keep"},
                {"name": "Pterodactyl Variation", "line": "1. d4 g6", "note": "remove"},
            ],
            "source": {"name": "Colle System"},
        }
        catalog = {"openings": [opening]}
        generated = {"w-colle-system": {**copy.deepcopy(opening), "variations": []}}

        refreshed, stats = refresh_named_variations(catalog, generated)

        self.assertEqual(
            [variation["name"] for variation in refreshed["openings"][0]["variations"]],
            ["Traditional Colle"],
        )
        self.assertEqual(stats["removed_without_named_source"], 1)

    def test_replaces_generic_rows_and_drops_unresolved_prefixes(self):
        opening = {
            "id": "w-sample",
            "title_zh": "示例開局",
            "title_en": "Sample Family Card",
            "aliases": [],
            "side": "白方",
            "category": "主流",
            "eco": "A00",
            "first_move": "e4",
            "styles": ["局面"],
            "difficulty": "初階",
            "mainline": "1. e4",
            "variations": [
                {"name": "Sample Opening", "line": "1. e4 e5", "note": "generic"},
                {"name": "Named Branch", "line": "1. e4 c5", "note": "curated"},
                {"name": "Named Branch", "line": "1. e4 e6", "note": "duplicate name"},
            ],
            "ideas": "中心控制與快速發展。",
            "plans": ["完成出子"],
            "mistakes": ["忽略王安全"],
            "source": {"dataset": "test", "license": "CC0-1.0", "name": "Family: Sample Opening", "pgn": "1. e4", "epd": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"},
        }
        catalog = {"schema_version": 1, "source": "test", "openings": [opening]}
        generated = {"w-sample": {**copy.deepcopy(opening), "variations": [
            {"name": "Named Branch", "line": "1. e4 c5", "note": "duplicate"},
            {"name": "Second Branch", "line": "1. e4 d5", "note": "generated"},
        ]}}

        refreshed, stats = refresh_named_variations(catalog, generated)

        self.assertEqual([variation["name"] for variation in refreshed["openings"][0]["variations"]], ["Named Branch", "Second Branch"])
        self.assertEqual(refreshed["openings"][0]["variations"][0]["note"], "curated")
        self.assertEqual(stats, {"affected_openings": 1, "replaced": 1, "removed_without_named_source": 1})


if __name__ == "__main__":
    unittest.main()
