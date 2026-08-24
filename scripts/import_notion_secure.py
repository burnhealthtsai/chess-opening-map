#!/usr/bin/env python3
"""Interactive Notion import that never persists or echoes the token."""
from __future__ import annotations

import getpass
import json
import os
import sys
from pathlib import Path

from chess_library.notion import NotionClient, NotionError, import_library

ROOT = Path(__file__).resolve().parents[1]
RESULT_PATH = ROOT / "build" / "notion-import-result.json"


def write_result(payload: dict) -> None:
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    write_result({"status": "waiting_for_input", "stage": "credentials"})
    print("西洋棋 Notion 圖庫安全匯入")
    print("Token 只保存在此程序的記憶體中，不會顯示或寫入檔案。")
    try:
        token = os.environ.get("NOTION_TOKEN", "").strip()
        parent_page_id = os.environ.get("NOTION_PARENT_PAGE_ID", "").strip()
        if not token:
            token = getpass.getpass("Notion integration token（隱藏輸入）：").strip()
        if not parent_page_id:
            parent_page_id = input("Notion 父頁 ID：").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n輸入已取消。")
        write_result({"status": "failed", "stage": "input", "message": "輸入已取消或 Terminal 提前關閉"})
        return 130
    if not token or not parent_page_id:
        print("Token 與父頁 ID 都必須提供。")
        write_result({"status": "failed", "stage": "input", "message": "缺少 token 或父頁 ID"})
        return 2

    try:
        client = NotionClient(token)
        write_result({"status": "running", "stage": "preflight"})
        identity = client.request("GET", "/users/me")
        client.request("GET", f"/pages/{parent_page_id}")
        print(f"預檢通過：{identity.get('name') or identity.get('type') or 'Notion integration'}")
        write_result({"status": "running", "stage": "import"})
        skip = os.environ.get("NOTION_SKIP_COMPLETE_EXISTING", "") == "1"
        forced = frozenset(filter(None, os.environ.get("NOTION_FORCE_UPDATE_IDS", "").split(",")))
        result = import_library(
            client,
            parent_page_id,
            skip_complete_existing=skip,
            force_update_ids=forced,
        )
    except (NotionError, ValueError) as exc:
        message = str(exc)
        print(f"匯入失敗：{message}")
        write_result({"status": "failed", "stage": "preflight_or_import", "message": message})
        return 1
    finally:
        token = ""

    payload = {"status": "complete", **result}
    write_result(payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print("匯入完成，可以關閉此視窗。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
