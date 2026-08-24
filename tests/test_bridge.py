import http.client
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from chess_library.bridge import BridgeServer, open_in_en_croissant
from chess_library.catalog import DEFAULT_CATALOG, load_catalog
from chess_library.variations import load_variations


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.opened = []
        self.server = BridgeServer(("127.0.0.1", 0), DEFAULT_CATALOG, "x" * 32, self.opened.append)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)

    def tearDown(self):
        self.connection.close()
        stopper = threading.Thread(target=self.server.shutdown, daemon=True)
        stopper.start(); stopper.join(timeout=2)
        self.server.server_close(); self.thread.join(timeout=2)

    def get(self, path):
        self.connection.request("GET", path)
        response = self.connection.getresponse(); response.read(); return response.status

    def test_health(self): self.assertEqual(self.get("/health"), 200)

    def test_rejects_bad_key_and_path_traversal(self):
        opening_id = load_catalog()["openings"][0]["id"]
        self.assertEqual(self.get(f"/open/{opening_id}?key=bad"), 403)
        self.assertEqual(self.get("/open/..%2Fsecret?key=" + "x" * 32), 404)
        self.assertEqual(self.opened, [])

    def test_opens_allowlisted_pgn(self):
        opening_id = load_catalog()["openings"][0]["id"]
        self.assertEqual(self.get(f"/open/{opening_id}?key=" + "x" * 32), 200)
        self.assertEqual(self.opened[0].name, opening_id + ".pgn")

    def test_opens_allowlisted_complete_variation(self):
        variation_id = load_variations()["variations"][0]["id"]
        self.assertEqual(self.get(f"/variation/{variation_id}?key=" + "x" * 32), 200)
        self.assertEqual(self.opened[0].name, variation_id + ".pgn")

    def test_rejects_unknown_complete_variation(self):
        self.assertEqual(self.get("/variation/v-a00-unknown-0000000000?key=" + "x" * 32), 404)
        self.assertEqual(self.opened, [])

    def test_refuses_non_loopback_bind(self):
        with self.assertRaises(ValueError): BridgeServer(("0.0.0.0", 0), DEFAULT_CATALOG, "x" * 32)

class OpenInEnCroissantTests(unittest.TestCase):
    @patch("chess_library.bridge.subprocess.run")
    @patch("chess_library.bridge.os.uname")
    def test_opens_pgn_in_a_new_instance(self, uname, run):
        uname.return_value.sysname = "Darwin"
        run.return_value.returncode = 0
        pgn_path = Path("/tmp/opening.pgn")

        open_in_en_croissant(pgn_path)

        run.assert_called_once_with(
            [
                "/usr/bin/open",
                "-n",
                "-a",
                "en-croissant",
                "--args",
                str(pgn_path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )


if __name__ == "__main__": unittest.main()
