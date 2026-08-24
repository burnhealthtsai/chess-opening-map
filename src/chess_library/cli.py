from __future__ import annotations

import argparse
import json
from pathlib import Path

from .audit import audit_library
from .bridge import serve
from .catalog import load_catalog, validate_catalog
from .generate import build_assets
from .notion import import_from_env, sync_scores_from_env
from .scoring import cache_engine_scores, score_openings
from .teaching import enrich_teaching
from .variations import build_variation_assets, load_variations
from .variation_notion import import_variations_from_env


def main() -> int:
    parser = argparse.ArgumentParser(prog="chess-library", description="Notion 西洋棋開局圖庫工具")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate", help="驗證 196 筆開局資料與棋步")
    sub.add_parser("build", help="產生 PGN 與 SVG 棋盤封面")
    sub.add_parser("validate-variations", help="驗證 3,810 筆完整變例與棋路")
    sub.add_parser("build-variations", help="產生完整變例 PGN")
    sub.add_parser("import-notion", help="從環境變數讀取憑證並一次性匯入 Notion")
    sub.add_parser("score-openings", help="計算 196 筆開局常用度與 Stockfish 優劣程度")
    sub.add_parser("score-engine", help="只計算並快取 196 筆 Stockfish 評分")
    sub.add_parser("sync-notion-scores", help="只同步常用度、優劣程度與 Gallery 排序")
    sub.add_parser("enrich-teaching", help="產生開局專屬計畫、錯誤與變例重點")
    sub.add_parser("audit", help="稽核資料、資產、評分與 Notion 部署完整性")
    sub.add_parser("import-variations-notion", help="匯入 3,810 筆 Notion 完整變例索引")
    bridge = sub.add_parser("bridge", help="啟動 En Croissant 本機橋接器")
    bridge.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "validate":
        stats = validate_catalog(load_catalog())
        print(f"驗證完成：共 {stats.total}，白方 {stats.white}，黑方 {stats.black}，趣味 {stats.fun}")
    elif args.command == "build":
        print(f"資產已產生：{build_assets()}")
    elif args.command == "validate-variations":
        data = load_variations()
        print(f"完整變例驗證完成：{len(data['variations'])} 筆")
    elif args.command == "build-variations":
        print(f"完整變例 PGN 已產生：{build_variation_assets()}")
    elif args.command == "import-notion":
        print(json.dumps(import_from_env(), ensure_ascii=False, indent=2))
    elif args.command == "score-openings":
        print(json.dumps(score_openings(), ensure_ascii=False, indent=2))
    elif args.command == "score-engine":
        print(json.dumps(cache_engine_scores(), ensure_ascii=False, indent=2))
    elif args.command == "sync-notion-scores":
        result = sync_scores_from_env()
        Path("build/notion-score-sync-result.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "enrich-teaching":
        print(json.dumps(enrich_teaching(), ensure_ascii=False, indent=2))
    elif args.command == "audit":
        report = audit_library()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["status"] == "complete" else 2
    elif args.command == "import-variations-notion":
        print(json.dumps(import_variations_from_env(), ensure_ascii=False, indent=2))
    elif args.command == "bridge":
        serve(port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
