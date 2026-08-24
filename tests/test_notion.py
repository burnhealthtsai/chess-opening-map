import copy
import unittest
from unittest.mock import patch

from chess_library.catalog import load_catalog
from chess_library.notion import (
    NotionError,
    ensure_views,
    find_or_create_database,
    import_library,
    page_blocks,
    page_properties,
    schema,
    sync_notion_scores,
)


class FakeClient:
    def __init__(self): self.calls = []
    def request(self, method, path, payload=None):
        self.calls.append((method, path, payload))
        if path.startswith("/views?"): return {"results": []}
        if path == "/data_sources/ds":
            return {"properties": {"常用度": {"id": "pop"}, "優劣程度": {"id": "adv"}}}
        return {"id": "x"}


class ImportFake:
    def __init__(self):
        self.database = None; self.pages = {}; self.views = {}; self.uploads = 0; self.calls = []
    def upload(self, path): self.uploads += 1; return f"upload-{self.uploads}"
    def request(self, method, path, payload=None):
        self.calls.append((method, path, payload))
        if path == "/search":
            if not self.database:
                return {"results": [], "has_more": False, "next_cursor": None}
            return {
                "results": [{
                    "object": "data_source",
                    "id": "ds",
                    "title": [{"plain_text": "西洋棋開局圖庫"}],
                    "parent": {"type": "database_id", "database_id": "db"},
                    "database_parent": {"type": "page_id", "page_id": "parent"},
                }],
                "has_more": False,
                "next_cursor": None,
            }
        if path == "/databases" and method == "POST":
            self.database = {"id": "db", "parent": {"page_id": "parent"}, "data_sources": [{"id": "ds"}]}; return self.database
        if path == "/databases/db": return self.database
        if path == "/data_sources/ds/query":
            return {
                "results": [{
                    "id": page["id"],
                    "properties": {
                        "Opening ID": {"rich_text": [{"plain_text": oid}]},
                        "封面圖片": {"files": page["cover"]},
                        "PGN": {"files": page["pgn"]},
                    },
                } for oid, page in self.pages.items()],
                "has_more": False,
            }
        if path == "/data_sources/ds" and method == "GET":
            return {
                "id": "ds",
                "properties": {
                    "常用度": {"id": "pop", "type": "number"},
                    "優劣程度": {"id": "adv", "type": "number"},
                },
            }
        if path == "/pages" and method == "POST":
            oid = payload["properties"]["Opening ID"]["rich_text"][0]["text"]["content"]
            page_id = f"page-{len(self.pages)+1}"
            self.pages[oid] = {"id": page_id, "cover": ["cover"], "pgn": ["pgn"]}
            return {"id": page_id}
        if path.startswith("/pages/") and method == "PATCH": return {"id": path.rsplit("/", 1)[-1]}
        if path.startswith("/blocks/"):
            return {"results": [], "has_more": False}
        if path == "/views?database_id=db": return {"results": [{"id": vid} for vid in self.views]}
        if path.startswith("/views/") and method == "GET":
            view = self.views[path.rsplit("/",1)[-1]]
            return view if isinstance(view, dict) else {"id": path.rsplit("/",1)[-1], "name": view}
        if path.startswith("/views/") and method == "PATCH":
            view_id = path.rsplit("/", 1)[-1]
            current = self.views[view_id]
            if not isinstance(current, dict): current = {"id": view_id, "name": current}
            current.update(payload); self.views[view_id] = current; return current
        if path == "/views" and method == "POST":
            vid = f"view-{len(self.views)+1}"; self.views[vid] = {"id": vid, **payload}; return {"id": vid}
        if method == "DELETE": return {"archived": True}
        return {"id": "ok"}


class NotionPayloadTests(unittest.TestCase):
    def setUp(self):
        self.catalog = copy.deepcopy(load_catalog())
        for item in self.catalog["openings"]:
            item.update({
                "popularity_pct": 73,
                "popularity_games": 1234,
                "advantage_pct": 51,
                "evaluation_cp": 7,
                "evaluation_depth": 18,
            })
        patcher = patch("chess_library.notion.load_catalog", return_value=self.catalog)
        patcher.start()
        self.addCleanup(patcher.stop)
        print_patcher = patch("builtins.print")
        print_patcher.start()
        self.addCleanup(print_patcher.stop)

    def test_searches_for_data_source_and_resolves_database_container(self):
        client = ImportFake()
        client.database = {
            "object": "database",
            "id": "db",
            "parent": {"type": "page_id", "page_id": "parent"},
            "data_sources": [{"id": "ds"}],
        }

        database, data_source_id = find_or_create_database(client, "parent")

        self.assertEqual(database["id"], "db")
        self.assertEqual(data_source_id, "ds")
        search = client.calls[0]
        self.assertEqual(search[1], "/search")
        self.assertEqual(search[2]["filter"], {"property": "object", "value": "data_source"})
        self.assertIn(("GET", "/databases/db", None), client.calls)

    def test_schema_has_required_properties_and_formula(self):
        value = schema()
        for name in ("開局名稱", "陣營", "ECO", "Opening ID", "Bridge URL", "開啟分析", "PGN", "封面圖片", "常用度", "優劣程度"):
            self.assertIn(name, value)
        self.assertIn("link(", value["開啟分析"]["formula"]["expression"])
        self.assertEqual(value["常用度"]["number"]["format"], "percent")
        self.assertEqual(value["優劣程度"]["number"]["format"], "percent")

    def test_page_payload_contains_safe_bridge_link(self):
        item = self.catalog["openings"][0]
        url = f"http://127.0.0.1:8765/open/{item['id']}?key=test"
        props = page_properties(item, url)
        self.assertEqual(props["Bridge URL"]["url"], url)
        self.assertEqual(props["常用度"]["number"], item["popularity_pct"] / 100)
        self.assertEqual(props["優劣程度"]["number"], item["advantage_pct"] / 100)
        blocks = page_blocks(item, url)
        self.assertGreaterEqual(len(blocks), 12)
        self.assertEqual(blocks[-1]["type"], "callout")

    def test_creates_four_named_views(self):
        client = FakeClient(); ensure_views(client, "db", "ds")
        creates = [call for call in client.calls if call[0] == "POST"]
        self.assertEqual([x[2]["name"] for x in creates], ["全部開局", "白方開局", "黑方開局", "ECO 索引"])
        self.assertEqual(creates[1][2]["filter"]["select"]["equals"], "白方")
        self.assertEqual(creates[0][2]["sorts"][0], {"property": "常用度", "direction": "descending"})
        visible = creates[0][2]["configuration"]["properties"]
        self.assertEqual({item["property_id"] for item in visible}, {"pop", "adv"})

    def test_import_is_idempotent_by_opening_id(self):
        client = ImportFake()
        first = import_library(client, "parent", bridge_key="k" * 32)
        second = import_library(client, "parent", bridge_key="k" * 32)
        self.assertEqual((first["created"], first["updated"]), (196, 0))
        self.assertEqual((second["created"], second["updated"]), (0, 196))
        self.assertEqual(len(client.pages), 196)
        self.assertEqual(client.uploads, 392)
        self.assertEqual({view["name"] for view in client.views.values()}, {"全部開局", "白方開局", "黑方開局", "ECO 索引"})
        self.assertIn(
            ("PATCH", "/databases/db", {
                "description": [{"type": "text", "text": {"content": "196 套繁中實戰開局；白方 98 套、黑方 98 套。"}}],
            }),
            client.calls,
        )
        self.assertFalse(any("/databases/" in path and path.endswith("/query") for _, path, _ in client.calls))
        search_calls = [call for call in client.calls if call[1] == "/search"]
        self.assertTrue(all(call[2]["filter"]["value"] == "data_source" for call in search_calls))

    def test_incremental_mode_preserves_complete_pages_and_repairs_forced_page(self):
        client = ImportFake()
        import_library(client, "parent", bridge_key="k" * 32)
        calls_before = len(client.calls)

        result = import_library(
            client,
            "parent",
            bridge_key="k" * 32,
            skip_complete_existing=True,
            force_update_ids=frozenset({"w-reti-opening"}),
        )

        self.assertEqual((result["created"], result["updated"], result["skipped"]), (0, 1, 195))
        new_calls = client.calls[calls_before:]
        page_patches = [call for call in new_calls if call[0] == "PATCH" and call[1].startswith("/pages/")]
        score_only = [call for call in page_patches if set(call[2].get("properties", {})) == {"常用度", "優劣程度"}]
        block_calls = [call for call in new_calls if call[1].startswith("/blocks/")]
        self.assertEqual(len(page_patches), 196)
        self.assertEqual(len(score_only), 195)
        self.assertEqual(len(block_calls), 2)
        self.assertEqual(client.uploads, 392)

    def test_score_sync_only_patches_schema_pages_and_views(self):
        client = ImportFake()
        import_library(client, "parent", bridge_key="k" * 32)
        client.calls.clear(); client.uploads = 0

        result = sync_notion_scores(client, "parent")

        self.assertEqual(result["updated"], 196)
        self.assertEqual(client.uploads, 0)
        self.assertFalse(any(path.startswith("/blocks/") for _, path, _ in client.calls))
        page_patches = [call for call in client.calls if call[0] == "PATCH" and call[1].startswith("/pages/")]
        self.assertEqual(len(page_patches), 196)
        self.assertTrue(all(set(call[2]["properties"]) == {"常用度", "優劣程度"} for call in page_patches))

    def test_score_sync_rejects_unexpected_opening_ids(self):
        client = ImportFake()
        import_library(client, "parent", bridge_key="k" * 32)
        client.pages["unexpected-opening"] = {
            "id": "page-extra", "cover": ["cover"], "pgn": ["pgn"],
        }

        with self.assertRaisesRegex(NotionError, "額外"):
            sync_notion_scores(client, "parent")

    def test_score_sync_rejects_duplicate_opening_ids(self):
        class DuplicateClient(ImportFake):
            def request(self, method, path, payload=None):
                result = super().request(method, path, payload)
                if path == "/data_sources/ds/query" and result.get("results"):
                    result["results"].append(copy.deepcopy(result["results"][0]))
                    result["results"][-1]["id"] = "duplicate-page"
                return result

        client = DuplicateClient()
        import_library(client, "parent", bridge_key="k" * 32)

        with self.assertRaisesRegex(NotionError, "重複 Opening ID"):
            sync_notion_scores(client, "parent")

    def test_existing_gallery_view_is_updated_without_losing_configuration(self):
        client = ImportFake()
        client.views["white"] = {
            "id": "white", "name": "白方開局", "type": "gallery",
            "configuration": {"type": "gallery", "cover_size": "small", "properties": []},
        }

        ensure_views(client, "db", "ds")

        updated = client.views["white"]
        self.assertEqual(updated["configuration"]["cover_size"], "small")
        self.assertEqual(updated["sorts"][0]["property"], "常用度")
        self.assertEqual({p["property_id"] for p in updated["configuration"]["properties"]}, {"pop", "adv"})


if __name__ == "__main__": unittest.main()
