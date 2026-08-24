import unittest

from chess_library.variation_notion import (
    import_variation_index,
    variation_properties,
    variation_schema,
)
from chess_library.variations import load_variations


class VariationImportFake:
    def __init__(self, opening_ids):
        self.opening_ids = list(opening_ids)
        self.variation_database = None
        self.pages = {}
        self.views = {}

    def request(self, method, path, payload=None):
        if path == "/search":
            query = payload.get("query")
            if query == "西洋棋開局圖庫":
                return {"results": [{
                    "id": "main-ds",
                    "title": [{"plain_text": "西洋棋開局圖庫"}],
                    "parent": {"database_id": "main-db"},
                    "database_parent": {"page_id": "parent"},
                }], "has_more": False}
            if self.variation_database:
                return {"results": [{
                    "id": "variation-ds",
                    "title": [{"plain_text": "西洋棋完整變例索引"}],
                    "parent": {"database_id": "variation-db"},
                    "database_parent": {"page_id": "parent"},
                }], "has_more": False}
            return {"results": [], "has_more": False}
        if path == "/databases/main-db":
            return {"id": "main-db", "parent": {"page_id": "parent"}}
        if path == "/databases/variation-db":
            return self.variation_database
        if path == "/databases" and method == "POST":
            self.variation_database = {
                "id": "variation-db",
                "parent": {"page_id": "parent"},
                "data_sources": [{"id": "variation-ds"}],
            }
            return self.variation_database
        if path == "/data_sources/main-ds/query":
            return {"results": [{
                "id": f"opening-page-{index}",
                "properties": {
                    "Opening ID": {"rich_text": [{"plain_text": opening_id}]},
                    "封面圖片": {"files": [{"name": "cover"}]},
                    "PGN": {"files": [{"name": "pgn"}]},
                },
            } for index, opening_id in enumerate(self.opening_ids)], "has_more": False}
        if path == "/data_sources/variation-ds/query":
            return {"results": [{
                "id": value["id"],
                "properties": {"Variation ID": {"rich_text": [{"plain_text": key}]}},
            } for key, value in self.pages.items()], "has_more": False}
        if path == "/pages" and method == "POST":
            variation_id = payload["properties"]["Variation ID"]["rich_text"][0]["text"]["content"]
            self.pages[variation_id] = {"id": f"variation-page-{len(self.pages) + 1}"}
            return self.pages[variation_id]
        if path == "/views?database_id=variation-db":
            return {"results": [{"id": view_id} for view_id in self.views]}
        if path.startswith("/views/") and method == "GET":
            view_id = path.rsplit("/", 1)[-1]
            return {"id": view_id, "name": self.views[view_id]}
        if path == "/views" and method == "POST":
            view_id = f"view-{len(self.views) + 1}"
            self.views[view_id] = payload["name"]
            return {"id": view_id}
        return {"id": "ok"}


class VariationNotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sample = load_variations()["variations"][:3]

    def test_schema_and_properties_contain_complete_line_and_links(self):
        schema = variation_schema()
        for name in ("變例名稱", "ECO", "根開局", "完整棋路", "Variation ID", "開啟分析"):
            self.assertIn(name, schema)
        item = self.sample[0]
        props = variation_properties(item, "http://127.0.0.1/variation", "https://www.notion.so/page")
        self.assertEqual(props["完整棋路"]["rich_text"][0]["text"]["content"], item["line"])
        self.assertEqual(props["Variation ID"]["rich_text"][0]["text"]["content"], item["id"])
        self.assertEqual(props["開啟分析"]["url"], "http://127.0.0.1/variation")
        self.assertEqual(props["主開局卡"]["url"], "https://www.notion.so/page")

    def test_import_is_resumable_by_variation_id(self):
        data = {"schema_version": 1, "variations": self.sample}
        client = VariationImportFake({item["opening_id"] for item in self.sample})
        first = import_variation_index(client, "parent", bridge_key="k" * 32, workers=1, data=data)
        second = import_variation_index(client, "parent", bridge_key="k" * 32, workers=1, data=data)
        self.assertEqual((first["created"], first["skipped"]), (3, 0))
        self.assertEqual((second["created"], second["skipped"]), (0, 3))
        self.assertEqual(len(client.pages), 3)
        self.assertEqual(set(client.views.values()), {"全部變例", "ECO 變例索引", "白方體系", "黑方體系"})


if __name__ == "__main__":
    unittest.main()
