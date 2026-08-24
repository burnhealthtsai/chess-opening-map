import unittest

from chess_library.audit import audit_library


class AuditTests(unittest.TestCase):
    def test_audit_covers_all_library_subsystems(self):
        report = audit_library()

        self.assertEqual(
            set(report["checks"]),
            {"catalog", "complete_variations", "teaching", "main_pgn", "covers", "variation_pgn", "scoring", "deployment"},
        )
        self.assertEqual(report["checks"]["catalog"]["total"], 196)
        self.assertEqual(report["checks"]["complete_variations"]["total"], 3810)
        self.assertEqual(report["checks"]["teaching"]["generic_variation_notes"], 0)
        self.assertEqual(report["checks"]["main_pgn"]["valid_files"], 196)
        self.assertEqual(report["checks"]["main_pgn"]["invalid_files"], [])
        self.assertEqual(report["checks"]["main_pgn"]["duplicate_game_files"], [])
        self.assertGreaterEqual(report["checks"]["scoring"]["engine_cached"], 0)

    def test_report_status_matches_incomplete_checks(self):
        report = audit_library()
        incomplete = [name for name, check in report["checks"].items() if check["status"] != "complete"]

        self.assertEqual(report["missing"], incomplete)
        self.assertEqual(report["status"], "complete" if not incomplete else "incomplete")


if __name__ == "__main__":
    unittest.main()
