from __future__ import annotations

import os
import threading
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from .bridge import DEFAULT_HOST, DEFAULT_PORT, get_or_create_key
from .notion import NotionClient, NotionError, _plain_title, existing_pages, find_or_create_database, rich
from .variations import load_variations

VARIATION_DATABASE_TITLE = "西洋棋完整變例索引"


def variation_schema() -> dict[str, Any]:
    select = lambda values: {"select": {"options": [{"name": value} for value in values]}}
    return {
        "變例名稱": {"title": {}},
        "ECO": {"rich_text": {}},
        "陣營": select(["白方", "黑方"]),
        "根開局": {"rich_text": {}},
        "完整棋路": {"rich_text": {}},
        "半回合數": {"number": {"format": "number"}},
        "Variation ID": {"rich_text": {}},
        "Opening ID": {"rich_text": {}},
        "主開局卡": {"url": {}},
        "開啟分析": {"url": {}},
    }


def variation_properties(item: dict, bridge_url: str, opening_page_url: str) -> dict[str, Any]:
    return {
        "變例名稱": {"title": rich(item["name"])},
        "ECO": {"rich_text": rich(item["eco"])},
        "陣營": {"select": {"name": item["side"]}},
        "根開局": {"rich_text": rich(f"{item['root_zh']} · {item['root_en']}")},
        "完整棋路": {"rich_text": rich(item["line"])},
        "半回合數": {"number": item["plies"]},
        "Variation ID": {"rich_text": rich(item["id"])},
        "Opening ID": {"rich_text": rich(item["opening_id"])},
        "主開局卡": {"url": opening_page_url},
        "開啟分析": {"url": bridge_url},
    }


def find_or_create_variation_database(client: NotionClient, parent_page_id: str) -> tuple[dict, str]:
    normalized_parent = parent_page_id.replace("-", "")
    cursor: str | None = None
    while True:
        payload: dict[str, Any] = {
            "query": VARIATION_DATABASE_TITLE,
            "filter": {"property": "object", "value": "data_source"},
            "page_size": 100,
        }
        if cursor:
            payload["start_cursor"] = cursor
        result = client.request("POST", "/search", payload)
        for data_source in result.get("results", []):
            database_id = data_source.get("parent", {}).get("database_id")
            if not database_id or _plain_title(data_source) not in ("", VARIATION_DATABASE_TITLE):
                continue
            database = client.request("GET", f"/databases/{database_id}")
            result_parent = data_source.get("database_parent", {}).get("page_id", "").replace("-", "")
            container_parent = database.get("parent", {}).get("page_id", "").replace("-", "")
            if normalized_parent in (result_parent, container_parent):
                return database, data_source["id"]
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
        if not cursor:
            break

    database = client.request("POST", "/databases", {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "title": [{"type": "text", "text": {"content": VARIATION_DATABASE_TITLE}}],
        "description": [{"type": "text", "text": {"content": "3,810 條完整棋路；3,174 個 Lichess CC0 標準變例名稱。"}}],
        "is_inline": False,
        "initial_data_source": {"properties": variation_schema()},
    })
    sources = database.get("data_sources", [])
    if not sources:
        raise NotionError("Notion 建立完整變例索引後未回傳 data source")
    return database, sources[0]["id"]


def existing_variation_pages(client: NotionClient, data_source_id: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    cursor: str | None = None
    while True:
        payload: dict[str, Any] = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        result = client.request("POST", f"/data_sources/{data_source_id}/query", payload)
        for page in result.get("results", []):
            values = page.get("properties", {}).get("Variation ID", {}).get("rich_text", [])
            if values:
                mapping[values[0].get("plain_text", "")] = page["id"]
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
        if not cursor:
            break
    return mapping


def ensure_variation_views(client: NotionClient, database_id: str, data_source_id: str) -> None:
    listed = client.request("GET", f"/views?database_id={urllib.parse.quote(database_id)}")
    names: set[str] = set()
    for ref in listed.get("results", []):
        view_id = ref.get("id") or ref.get("view", {}).get("id")
        if view_id:
            names.add(client.request("GET", f"/views/{view_id}").get("name", ""))
    specs = [
        ("全部變例", None),
        ("ECO 變例索引", None),
        ("白方體系", "白方"),
        ("黑方體系", "黑方"),
    ]
    for name, side in specs:
        if name in names:
            continue
        body: dict[str, Any] = {
            "database_id": database_id,
            "data_source_id": data_source_id,
            "name": name,
            "type": "table",
            "sorts": [
                {"property": "ECO", "direction": "ascending"},
                {"property": "變例名稱", "direction": "ascending"},
            ],
        }
        if side:
            body["filter"] = {"property": "陣營", "select": {"equals": side}}
        client.request("POST", "/views", body)


def import_variation_index(
    client: NotionClient,
    parent_page_id: str,
    *,
    bridge_key: str | None = None,
    workers: int = 3,
    data: dict[str, Any] | None = None,
) -> dict[str, int | str]:
    if not parent_page_id:
        raise ValueError("NOTION_PARENT_PAGE_ID 未設定")
    data = data or load_variations()
    bridge_key = bridge_key or get_or_create_key()
    _, main_data_source_id = find_or_create_database(client, parent_page_id)
    main_pages = existing_pages(client, main_data_source_id)
    database, variation_data_source_id = find_or_create_variation_database(client, parent_page_id)
    database_id = database["id"]
    existing = existing_variation_pages(client, variation_data_source_id)
    pending = [item for item in data["variations"] if item["id"] not in existing]
    skipped = len(data["variations"]) - len(pending)
    total = len(data["variations"])
    completed = skipped
    lock = threading.Lock()

    def create(item: dict) -> str:
        parent = main_pages.get(item["opening_id"])
        if parent is None:
            raise NotionError(f"找不到主開局頁：{item['opening_id']}")
        opening_page_url = f"https://www.notion.so/{str(parent['page_id']).replace('-', '')}"
        bridge_url = (
            f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/variation/{item['id']}"
            f"?key={urllib.parse.quote(bridge_key)}"
        )
        client.request("POST", "/pages", {
            "parent": {"type": "data_source_id", "data_source_id": variation_data_source_id},
            "properties": variation_properties(item, bridge_url, opening_page_url),
        })
        return item["name"]

    if skipped:
        print(f"[{skipped:04d}/{total}] 已存在的變例已保留")
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 3))) as executor:
        futures = [executor.submit(create, item) for item in pending]
        for future in as_completed(futures):
            name = future.result()
            with lock:
                completed += 1
                if completed == total or completed % 25 == 0:
                    print(f"[{completed:04d}/{total}] {name}")

    ensure_variation_views(client, database_id, variation_data_source_id)
    return {
        "database_id": database_id,
        "data_source_id": variation_data_source_id,
        "created": len(pending),
        "skipped": skipped,
        "total": total,
    }


def import_variations_from_env() -> dict[str, int | str]:
    return import_variation_index(
        NotionClient(os.environ.get("NOTION_TOKEN", "")),
        os.environ.get("NOTION_PARENT_PAGE_ID", ""),
        workers=int(os.environ.get("NOTION_VARIATION_WORKERS", "3")),
    )
