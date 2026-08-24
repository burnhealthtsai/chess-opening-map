import math
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from chess_library.scoring import (
    LichessExplorer,
    ScoringError,
    advantage_percent,
    fetch_popularity_counts,
    load_engine_cache,
    popularity_percentages,
    recognition_fen,
    save_engine_cache,
)


class ScoringTests(unittest.TestCase):
    def test_popularity_is_log_normalized_and_handles_zero(self):
        scores = popularity_percentages({"rare": 0, "common": 99, "max": 9999})

        self.assertEqual(scores["rare"], 0)
        self.assertEqual(scores["max"], 100)
        self.assertTrue(0 < scores["common"] < 100)
        expected = round(100 * math.log1p(99) / math.log1p(9999))
        self.assertEqual(scores["common"], expected)

    def test_popularity_returns_zero_when_every_position_has_no_games(self):
        self.assertEqual(popularity_percentages({"a": 0, "b": 0}), {"a": 0, "b": 0})

    def test_advantage_is_equal_at_zero_and_reverses_for_black(self):
        self.assertEqual(advantage_percent(0, "白方"), 50)
        white = advantage_percent(200, "白方")
        black = advantage_percent(200, "黑方")
        self.assertGreater(white, 50)
        self.assertLess(black, 50)
        self.assertEqual(white + black, 100)

    def test_advantage_maps_forced_results_to_bounds(self):
        self.assertEqual(advantage_percent(100_000, "白方"), 100)
        self.assertEqual(advantage_percent(-100_000, "白方"), 0)
        self.assertEqual(advantage_percent(100_000, "黑方"), 0)

    def test_recognition_position_uses_exactly_eight_plies(self):
        short = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6"
        long = short + " 5. d3 d6 6. O-O O-O"

        self.assertEqual(recognition_fen(short), recognition_fen(long))

    def test_explorer_requires_a_separate_lichess_token(self):
        with self.assertRaisesRegex(ScoringError, "LICHESS_TOKEN"):
            LichessExplorer(token="")

    def test_popularity_cache_avoids_requerying_positions(self):
        class FakeExplorer:
            def __init__(self): self.calls = []
            def game_count(self, fen): self.calls.append(fen); return len(fen)

        explorer = FakeExplorer()
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache.json"
            first = fetch_popularity_counts({"fen-a", "fen-b"}, cache_path=cache, explorer=explorer)
            second = fetch_popularity_counts({"fen-a", "fen-b"}, cache_path=cache, explorer=explorer)

        self.assertEqual(first, second)
        self.assertEqual(sorted(explorer.calls), ["fen-a", "fen-b"])

    @patch.dict("os.environ", {}, clear=True)
    def test_fully_cached_popularity_does_not_require_token(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache.json"
            seeded = fetch_popularity_counts(
                {"fen-a"}, cache_path=cache,
                explorer=type("Explorer", (), {"game_count": lambda self, fen: 42})(),
            )
            cached = fetch_popularity_counts({"fen-a"}, cache_path=cache)

        self.assertEqual(seeded, {"fen-a": 42})
        self.assertEqual(cached, seeded)

    @patch("chess_library.scoring.time.sleep")
    @patch("chess_library.scoring.urllib.request.urlopen")
    def test_explorer_sends_bearer_token_and_retries_429(self, urlopen, sleep):
        retry = HTTPError("https://example", 429, "rate limited", {"Retry-After": "0.01"}, io.BytesIO(b""))
        urlopen.side_effect = [retry, io.BytesIO(b'{"white": 3, "draws": 2, "black": 4}')]

        count = LichessExplorer(token="secret").game_count("test-fen")

        self.assertEqual(count, 9)
        request = urlopen.call_args_list[0].args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")
        self.assertTrue(request.full_url.startswith("https://explorer.lichess.org/lichess?"))
        self.assertIn("speeds=blitz%2Crapid%2Cclassical", request.full_url)
        self.assertIn("ratings=1000%2C1200%2C1400%2C1600", request.full_url)
        sleep.assert_called_once_with(0.01)

    def test_engine_cache_resumes_and_invalidates_changed_lines(self):
        openings = [
            {"id": "one", "mainline": "1. e4 e5"},
            {"id": "two", "mainline": "1. d4 d5"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = root / "stockfish"
            engine.write_bytes(b"engine")
            cache = root / "engine-cache.json"
            save_engine_cache(openings, {"one": 24, "two": -10}, "Stockfish Test", engine, cache_path=cache)

            values, name = load_engine_cache(openings, engine, cache_path=cache)
            changed = [dict(openings[0]), {"id": "two", "mainline": "1. c4 e5"}]
            changed_values, _ = load_engine_cache(changed, engine, cache_path=cache)

        self.assertEqual(values, {"one": 24, "two": -10})
        self.assertEqual(name, "Stockfish Test")
        self.assertEqual(changed_values, {"one": 24})


if __name__ == "__main__":
    unittest.main()
