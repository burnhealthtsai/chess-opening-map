import json
import unittest

from chess_library.catalog import DEFAULT_CATALOG
from chess_library.teaching import enrich_catalog, variation_note


class TeachingTests(unittest.TestCase):
    def test_variation_note_identifies_actual_branch_move(self):
        note = variation_note(
            "義大利開局",
            "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5",
            "雙馬防禦",
            "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6",
        )

        self.assertIn("第 3 回合", note)
        self.assertIn("黑方走 Nf6 分歧", note)

    def test_all_openings_receive_specific_teaching_content(self):
        raw = json.loads(DEFAULT_CATALOG.read_text(encoding="utf-8"))
        enriched = enrich_catalog(raw)

        plans = {tuple(item["plans"]) for item in enriched["openings"]}
        mistakes = {tuple(item["mistakes"]) for item in enriched["openings"]}
        notes = [variation["note"] for item in enriched["openings"] for variation in item["variations"]]
        self.assertGreaterEqual(len(plans), 12)
        self.assertGreaterEqual(len(mistakes), 12)
        self.assertFalse(any("比較兵形、子力配置與典型突破時機" == note for note in notes))
        self.assertTrue(all("分歧" in note or "延伸" in note for note in notes))


if __name__ == "__main__":
    unittest.main()
