from __future__ import annotations

import json
import mimetypes
import os
import random
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

import certifi

from .bridge import DEFAULT_HOST, DEFAULT_PORT, get_or_create_key
from .catalog import ROOT, load_catalog
from .generate import build_assets

API = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"


class NotionError(RuntimeError):
    pass


class NotionClient:
    def __init__(self, token: str, *, base_url: str = API, retries: int = 5):
        if not token:
            raise ValueError("NOTION_TOKEN 未設定")
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.retries = retries
        self.ssl_context = ssl.create_default_context(cafile=certifi.where())

    def request(self, method: str, path: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Authorization": f"Bearer {self.token}", "Notion-Version": NOTION_VERSION}
        if data is not None: headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        for attempt in range(self.retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=45, context=self.ssl_context) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", "replace")
                if exc.code not in (429, 500, 502, 503, 504, 529) or attempt == self.retries:
                    raise NotionError(f"Notion API {exc.code}: {body}") from exc
                delay = float(exc.headers.get("Retry-After", 0) or 0) or min(2 ** attempt + random.random(), 20)
                time.sleep(delay)
            except urllib.error.URLError as exc:
                if attempt == self.retries: raise NotionError(f"Notion 網路錯誤：{exc.reason}") from exc
                time.sleep(min(2 ** attempt, 20))
        raise AssertionError("unreachable")

    def upload(self, path: Path) -> str:
        # Notion rejects the standard chess .pgn extension. PGN is UTF-8 text,
        # so upload it through the supported plain-text transport; the page
        # property keeps the user-facing .pgn filename.
        upload_name = f"{path.stem}.txt" if path.suffix.lower() == ".pgn" else path.name
        mime = "text/plain" if path.suffix.lower() == ".pgn" else (mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        created = self.request("POST", "/file_uploads", {"mode": "single_part", "filename": upload_name, "content_type": mime})
        upload_id = created["id"]
        boundary = f"----notion-chess-{uuid.uuid4().hex}"
        file_data = path.read_bytes()
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{upload_name}\"\r\n"
                f"Content-Type: {mime}\r\n\r\n").encode() + file_data + f"\r\n--{boundary}--\r\n".encode()
        headers = {"Authorization": f"Bearer {self.token}", "Notion-Version": NOTION_VERSION,
                   "Content-Type": f"multipart/form-data; boundary={boundary}"}
        request = urllib.request.Request(f"{self.base_url}/file_uploads/{upload_id}/send", data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=90, context=self.ssl_context) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            raise NotionError(f"檔案上傳失敗 {exc.code}: {exc.read().decode('utf-8', 'replace')}") from exc
        if result.get("status") not in ("uploaded", "pending"):
            raise NotionError(f"檔案上傳狀態異常：{result}")
        return upload_id


def schema() -> dict[str, Any]:
    select = lambda values: {"select": {"options": [{"name": value} for value in values]}}
    return {
        "開局名稱": {"title": {}}, "陣營": select(["白方", "黑方"]), "ECO": {"rich_text": {}},
        "首著分類": select(["e4", "d4", "c4", "Nf3", "其他"]), "棋風": {"multi_select": {"options": []}},
        "難度": select(["初中階"]), "代表主線": {"rich_text": {}}, "變例數": {"number": {"format": "number"}},
        "常用度": {"number": {"format": "percent"}},
        "優劣程度": {"number": {"format": "percent"}},
        "Opening ID": {"rich_text": {}}, "Bridge URL": {"url": {}},
        "開啟分析": {"formula": {"expression": 'link("♟ 在 En Croissant 分析", prop("Bridge URL"))'}},
        "PGN": {"files": {}}, "封面圖片": {"files": {}},
    }


def import_library(
    client: NotionClient,
    parent_page_id: str,
    *,
    bridge_key: str | None = None,
    skip_complete_existing: bool = False,
    force_update_ids: frozenset[str] = frozenset(),
) -> dict[str, int | str]:
    if not parent_page_id: raise ValueError("NOTION_PARENT_PAGE_ID 未設定")
    catalog = load_catalog(require_scores=True)
    assets = build_assets()
    bridge_key = bridge_key or get_or_create_key()
    database, data_source_id = find_or_create_database(client, parent_page_id)
    database_id = database["id"]
    ensure_score_schema(client, data_source_id)
    white = sum(item["side"] == "白方" for item in catalog["openings"])
    black = sum(item["side"] == "黑方" for item in catalog["openings"])
    description = f"{len(catalog['openings'])} 套繁中實戰開局；白方 {white} 套、黑方 {black} 套。"
    client.request("PATCH", f"/databases/{database_id}", {
        "description": [{"type": "text", "text": {"content": description}}],
    })
    existing = existing_pages(client, data_source_id)
    created = updated = skipped = 0
    total = len(catalog["openings"])
    progress_width = len(str(total))
    for index, item in enumerate(catalog["openings"], 1):
        url = f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/open/{item['id']}?key={urllib.parse.quote(bridge_key)}"
        existing_page = existing.get(item["id"])
        if (
            existing_page
            and skip_complete_existing
            and item["id"] not in force_update_ids
            and existing_page["has_cover"]
            and existing_page["has_pgn"]
        ):
            client.request("PATCH", f"/pages/{existing_page['page_id']}", {
                "properties": score_properties(item),
            })
            skipped += 1
            print(f"[{index:0{progress_width}d}/{total}] {item['title_zh']} (保留)")
            continue
        if existing_page:
            cover_id = None if existing_page["has_cover"] else client.upload(assets / "covers" / f"{item['id']}.svg")
            pgn_id = None if existing_page["has_pgn"] else client.upload(assets / "pgn" / f"{item['id']}.pgn")
            properties = page_properties(item, url, cover_id, pgn_id)
            payload: dict[str, Any] = {"properties": properties}
            if cover_id:
                payload["cover"] = {"type": "file_upload", "file_upload": {"id": cover_id}}
            client.request("PATCH", f"/pages/{existing_page['page_id']}", payload)
            replace_children(client, existing_page["page_id"], page_blocks(item, url))
            updated += 1
        else:
            cover_id = client.upload(assets / "covers" / f"{item['id']}.svg")
            pgn_id = client.upload(assets / "pgn" / f"{item['id']}.pgn")
            properties = page_properties(item, url, cover_id, pgn_id)
            client.request("POST", "/pages", {
                "parent": {"type": "data_source_id", "data_source_id": data_source_id},
                "properties": properties, "cover": {"type": "file_upload", "file_upload": {"id": cover_id}},
                "children": page_blocks(item, url),
            })
            created += 1
        print(f"[{index:0{progress_width}d}/{total}] {item['title_zh']}")
    ensure_views(client, database_id, data_source_id)
    return {"database_id": database_id, "created": created, "updated": updated, "skipped": skipped}


def _plain_title(value: dict[str, Any]) -> str:
    return "".join(part.get("plain_text") or part.get("text", {}).get("content", "") for part in value.get("title", []))


def find_or_create_database(client: NotionClient, parent_page_id: str) -> tuple[dict, str]:
    """Return the database container and its matching data source ID.

    Since Notion API 2025-09-03, Search exposes data sources rather than
    database containers. Database endpoints remain valid for creating and
    retrieving the container itself, while pages and queries use data sources.
    """
    normalized_parent = parent_page_id.replace("-", "")
    cursor: str | None = None
    while True:
        payload: dict[str, Any] = {
            "query": "西洋棋開局圖庫",
            "filter": {"property": "object", "value": "data_source"},
            "page_size": 100,
        }
        if cursor:
            payload["start_cursor"] = cursor
        result = client.request("POST", "/search", payload)
        for data_source in result.get("results", []):
            database_parent = data_source.get("database_parent", {})
            database_id = data_source.get("parent", {}).get("database_id")
            title = _plain_title(data_source)
            if database_id and (not title or title == "西洋棋開局圖庫"):
                database = client.request("GET", f"/databases/{database_id}")
                result_parent = database_parent.get("page_id", "").replace("-", "")
                container_parent = database.get("parent", {}).get("page_id", "").replace("-", "")
                if normalized_parent not in (result_parent, container_parent):
                    continue
                return database, data_source["id"]
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
        if not cursor:
            break

    database = client.request("POST", "/databases", {
        "parent": {"type": "page_id", "page_id": parent_page_id},
        "title": [{"type": "text", "text": {"content": "西洋棋開局圖庫"}}],
        "description": [{"type": "text", "text": {"content": "196 套繁中實戰開局；白方 98 套、黑方 98 套。"}}],
        "is_inline": False, "initial_data_source": {"properties": schema()},
    })
    data_sources = database.get("data_sources", [])
    if not data_sources:
        raise NotionError("Notion 建立資料庫後未回傳 data source")
    return database, data_sources[0]["id"]


def existing_pages(client: NotionClient, data_source_id: str) -> dict[str, dict[str, str | bool]]:
    mapping: dict[str, dict[str, str | bool]] = {}; cursor = None
    while True:
        payload: dict[str, Any] = {"page_size": 100}
        if cursor: payload["start_cursor"] = cursor
        result = client.request("POST", f"/data_sources/{data_source_id}/query", payload)
        for page in result.get("results", []):
            properties = page.get("properties", {})
            values = properties.get("Opening ID", {}).get("rich_text", [])
            if values:
                opening_id = values[0].get("plain_text", "")
                if opening_id in mapping:
                    raise NotionError(f"Notion 含重複 Opening ID：{opening_id}")
                mapping[opening_id] = {
                    "page_id": page["id"],
                    "has_cover": bool(properties.get("封面圖片", {}).get("files", [])),
                    "has_pgn": bool(properties.get("PGN", {}).get("files", [])),
                }
        if not result.get("has_more"): break
        cursor = result["next_cursor"]
    return mapping


def rich(text: str) -> list[dict]:
    return [{"type": "text", "text": {"content": text[:2000]}}]


def page_properties(item: dict, url: str, cover_id: str | None = None, pgn_id: str | None = None) -> dict:
    props = {
        "開局名稱": {"title": rich(f"{item['title_zh']} · {item['title_en']}")}, "陣營": {"select": {"name": item["side"]}},
        "ECO": {"rich_text": rich(item["eco"])}, "首著分類": {"select": {"name": item["first_move"]}},
        "棋風": {"multi_select": [{"name": value} for value in item["styles"]]}, "難度": {"select": {"name": item["difficulty"]}},
        "代表主線": {"rich_text": rich(item["mainline"])}, "變例數": {"number": len(item["variations"])},
        **score_properties(item),
        "Opening ID": {"rich_text": rich(item["id"])}, "Bridge URL": {"url": url},
    }
    if cover_id: props["封面圖片"] = {"files": [{"name": f"{item['id']}.svg", "type": "file_upload", "file_upload": {"id": cover_id}}]}
    if pgn_id: props["PGN"] = {"files": [{"name": f"{item['id']}.pgn", "type": "file_upload", "file_upload": {"id": pgn_id}}]}
    return props


def score_properties(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "常用度": {"number": item["popularity_pct"] / 100},
        "優劣程度": {"number": item["advantage_pct"] / 100},
    }


def ensure_score_schema(client: NotionClient, data_source_id: str) -> None:
    client.request("PATCH", f"/data_sources/{data_source_id}", {
        "properties": {
            "常用度": {
                "number": {"format": "percent"},
                "description": "Lichess 1000–1600 玩家中此前 8 個半回合局面的相對常用度。",
            },
            "優劣程度": {
                "number": {"format": "percent"},
                "description": "代表主線終局的 Stockfish 評估；50% 約等勢，分數以卡片陣營視角呈現。",
            },
        },
    })


def heading(text: str, level: int = 2) -> dict:
    return {"object": "block", "type": f"heading_{level}", f"heading_{level}": {"rich_text": rich(text)}}


def paragraph(text: str) -> dict:
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich(text)}}


def page_blocks(item: dict, url: str) -> list[dict]:
    blocks = [heading("開局概覽"), paragraph(item["ideas"]), heading("代表主線"),
              {"object": "block", "type": "code", "code": {"language": "plain text", "rich_text": rich(item["mainline"])}},
              heading("重要變例")]
    for variation in item["variations"]:
        blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": rich(variation["name"]), "children": [paragraph(variation["line"]), paragraph(variation["note"])]}})
    blocks += [heading("典型計畫"), *[paragraph(f"• {x}") for x in item["plans"]], heading("常見錯誤"),
               *[paragraph(f"• {x}") for x in item["mistakes"]],
               {"object": "block", "type": "callout", "callout": {"icon": {"type": "emoji", "emoji": "♟️"},
                "rich_text": [{"type": "text", "text": {"content": "在 En Croissant 分析", "link": {"url": url}}}]}}]
    return blocks


def replace_children(client: NotionClient, page_id: str, blocks: list[dict]) -> None:
    result = client.request("GET", f"/blocks/{page_id}/children?page_size=100")
    for block in result.get("results", []): client.request("DELETE", f"/blocks/{block['id']}")
    client.request("PATCH", f"/blocks/{page_id}/children", {"children": blocks})


def ensure_views(client: NotionClient, database_id: str, data_source_id: str) -> None:
    listed = client.request("GET", f"/views?database_id={urllib.parse.quote(database_id)}")
    views: dict[str, dict[str, Any]] = {}
    for ref in listed.get("results", []):
        view_id = ref.get("id") or ref.get("view", {}).get("id")
        if view_id:
            view = client.request("GET", f"/views/{view_id}")
            if view.get("name"):
                views[view["name"]] = view
    data_source = client.request("GET", f"/data_sources/{data_source_id}")
    properties = data_source.get("properties", {})
    score_ids = [properties.get(name, {}).get("id") for name in ("常用度", "優劣程度")]
    score_ids = [value for value in score_ids if value]

    def gallery_configuration(existing: dict[str, Any] | None = None) -> dict[str, Any]:
        configuration = dict((existing or {}).get("configuration") or {})
        configuration["type"] = "gallery"
        visible = [dict(value) for value in configuration.get("properties") or []]
        by_id = {value.get("property_id"): value for value in visible}
        for property_id in score_ids:
            if property_id in by_id:
                by_id[property_id]["visible"] = True
            else:
                visible.append({"property_id": property_id, "visible": True})
        configuration["properties"] = visible
        return configuration

    specs = [("全部開局", "gallery", None), ("白方開局", "gallery", "白方"), ("黑方開局", "gallery", "黑方"), ("ECO 索引", "table", None)]
    for name, kind, side in specs:
        sorts = ([
            {"property": "常用度", "direction": "descending"},
            {"property": "優劣程度", "direction": "descending"},
            {"property": "ECO", "direction": "ascending"},
        ] if kind == "gallery" else [{"property": "ECO", "direction": "ascending"}])
        existing = views.get(name)
        if existing:
            patch: dict[str, Any] = {"sorts": sorts}
            if kind == "gallery":
                patch["configuration"] = gallery_configuration(existing)
            client.request("PATCH", f"/views/{existing['id']}", patch)
            continue
        body: dict[str, Any] = {
            "database_id": database_id,
            "data_source_id": data_source_id,
            "name": name,
            "type": kind,
            "sorts": sorts,
        }
        if side:
            body["filter"] = {"property": "陣營", "select": {"equals": side}}
        if kind == "gallery":
            body["configuration"] = gallery_configuration()
        # Each page already has its uploaded board image as the page cover, so a
        # gallery's default page-cover preview works without unstable property IDs.
        client.request("POST", "/views", body)


def sync_notion_scores(client: NotionClient, parent_page_id: str) -> dict[str, int | str]:
    if not parent_page_id:
        raise ValueError("NOTION_PARENT_PAGE_ID 未設定")
    catalog = load_catalog(require_scores=True)
    database, data_source_id = find_or_create_database(client, parent_page_id)
    ensure_score_schema(client, data_source_id)
    existing = existing_pages(client, data_source_id)
    missing = [item["id"] for item in catalog["openings"] if item["id"] not in existing]
    if missing:
        raise NotionError(f"Notion 缺少 {len(missing)} 張主開局卡；請先執行 import-notion")
    expected_ids = {item["id"] for item in catalog["openings"]}
    unexpected = sorted(set(existing) - expected_ids)
    if unexpected:
        preview = "、".join(unexpected[:5])
        raise NotionError(f"Notion 含 {len(unexpected)} 個額外 Opening ID：{preview}")
    total = len(catalog["openings"])
    for index, item in enumerate(catalog["openings"], 1):
        client.request("PATCH", f"/pages/{existing[item['id']]['page_id']}", {
            "properties": score_properties(item),
        })
        if index == total or index % 10 == 0:
            print(f"[{index:03d}/{total}] {item['title_zh']}：常用度 {item['popularity_pct']}%，優劣 {item['advantage_pct']}%")
    ensure_views(client, database["id"], data_source_id)
    return {"database_id": database["id"], "updated": total, "status": "complete"}


def import_from_env() -> dict[str, int | str]:
    token = os.environ.get("NOTION_TOKEN", "")
    parent = os.environ.get("NOTION_PARENT_PAGE_ID", "")
    skip = os.environ.get("NOTION_SKIP_COMPLETE_EXISTING", "") == "1"
    forced = frozenset(filter(None, os.environ.get("NOTION_FORCE_UPDATE_IDS", "").split(",")))
    return import_library(
        NotionClient(token),
        parent,
        skip_complete_existing=skip,
        force_update_ids=forced,
    )


def sync_scores_from_env() -> dict[str, int | str]:
    return sync_notion_scores(
        NotionClient(os.environ.get("NOTION_TOKEN", "")),
        os.environ.get("NOTION_PARENT_PAGE_ID", ""),
    )
