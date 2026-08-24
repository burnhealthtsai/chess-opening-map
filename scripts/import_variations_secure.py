#!/usr/bin/env python3
"""Secure resumable import for the 3,810-row Notion variation index."""
from __future__ import annotations

import getpass
import json
import os
from pathlib import Path

from chess_library.notion import NotionClient, NotionError
from chess_library.variation_notion import import_variation_index

ROOT = Path(__file__).resolve().parents[1]
RESULT_PATH = ROOT / "build" / "notion-variation-import-result.json"


def write_result(payload: dict) -> None:
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    write_result({"status": "waiting_for_input", "stage": "credentials"})
    print("西洋棋 Notion 完整變例索引匯入")
    print("Token 只保存在此程序的記憶體中，不會顯示或寫入檔案。")
    token = os.environ.get("NOTION_TOKEN", "").strip() or getpass.getpass("Notion integration token（隱藏輸入）：").strip()
    parent = os.environ.get("NOTION_PARENT_PAGE_ID", "").strip() or input("Notion 父頁 ID：").strip()
    if not token or not parent:
        write_result({"status": "failed", "stage": "input", "message": "缺少 token 或父頁 ID"})
        return 2
    try:
        client = NotionClient(token)
        write_result({"status": "running", "stage": "preflight"})
        identity = client.request("GET", "/users/me")
        client.request("GET", f"/pages/{parent}")
        print(f"預檢通過：{identity.get('name') or identity.get('type') or 'Notion integration'}")
        write_result({"status": "running", "stage": "import"})
        result = import_variation_index(
            client,
            parent,
            workers=int(os.environ.get("NOTION_VARIATION_WORKERS", "3")),
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
