# 西洋棋 Notion 開局圖庫

一套可重建、可一次匯入 Notion 的繁體中文西洋棋開局圖庫。內含 196 張開局卡（白方 98、黑方 98），完整涵蓋 Lichess CC0 資料集的 149 個頂層開局家族，並為各開局保留最多三條官方重要變例、PGN、棋盤封面，以及連到 macOS En Croissant 的本機橋接器。

## 內容

- `openings.yaml`：唯一資料來源；格式是 JSON-compatible YAML，可直接用一般編輯器維護。
- `build/pgn/`：196 份 En Croissant 可開啟的 PGN。
- `build/covers/`：196 張 960×960 SVG 棋盤封面；白方／黑方視角依分類翻轉。
- `variations.json`：Lichess CC0 完整變例索引，含 3,810 條唯一棋路與 3,174 個標準名稱。
- `build/variation-pgn/`：3,810 份可由 En Croissant 開啟的完整變例 PGN。
- `src/chess_library/notion.py`：Notion API `2026-03-11` 一次性、可重複執行的匯入器。
- `src/chess_library/scoring.py`：Lichess 實戰常用度與 Stockfish 優劣程度評分器。
- `src/chess_library/bridge.py`：只監聽 `127.0.0.1` 的 En Croissant 橋接器。
- `scripts/install_launch_agent.py`：登入時自動啟動橋接器的安裝／移除工具。

開局名稱、ECO 與標準棋步衍生自 [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)，該資料集採 CC0-1.0。繁中名稱、教學摘要與資產由本專案整理生成。

## 1. 安裝與驗證

需要 macOS 與 Python 3.11 以上：

```bash
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/chess-library validate
.venv/bin/chess-library build
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
.venv/bin/chess-library validate-variations
.venv/bin/chess-library build-variations
```

正常結果應為：196 張卡、白方 98、黑方 98、趣味開局 39，並在 `build/` 產生 196 張封面和 196 份 PGN。

## 2. 設定 En Croissant 橋接器

先確認 `en-croissant.app` 位於 `/Applications`，而且已在程式內設定 Stockfish。手動測試橋接器：

```bash
.venv/bin/chess-library bridge
```

瀏覽器開啟 <http://127.0.0.1:8765/health> 應顯示「橋接器運作正常」。

設定登入後自動啟動：

```bash
.venv/bin/python scripts/install_launch_agent.py install
```

移除自動啟動：

```bash
.venv/bin/python scripts/install_launch_agent.py uninstall
```

安裝器只建立 `~/Library/LaunchAgents/com.local.notion-chess-bridge.plist`。本機密鑰存於專案根目錄的 `.notion-chess-key`（權限 `0600`，已被 Git 忽略），橋接器不會把包含密鑰的完整 URL 寫進日誌。

## 3. 建立 Notion integration

1. 到 [Notion integrations](https://www.notion.so/profile/integrations) 建立 Internal integration。
2. 開啟 Read content、Insert content、Update content 權限。
3. 在 Notion 建立一個空白父頁，從頁面選單把該 integration 加入連線。
4. 從頁面網址複製父頁 ID。
5. 在同一個 Terminal 工作階段設定環境變數；不要把 token 寫進專案檔案：

```bash
export NOTION_TOKEN='你的 integration token'
export NOTION_PARENT_PAGE_ID='你的父頁 ID'
.venv/bin/chess-library import-notion
```

匯入器會建立「西洋棋開局圖庫」、196 張頁面，以及 `全部開局`、`白方開局`、`黑方開局`、`ECO 索引` 四個視圖。再次執行時會依 `Opening ID` 更新既有卡片，不會重複建立。新卡片會上傳封面與 PGN；既有卡片保留已上傳檔案，更新屬性與內文。

### 更新常用度與優劣程度

Lichess Opening Explorer 目前要求登入驗證。建立不需額外權限的個人 token，僅在目前 Terminal 設為環境變數；token 不會寫入資料、快取或日誌：

```bash
export LICHESS_TOKEN='你的 Lichess token'
.venv/bin/chess-library score-openings
```

此命令以 1000–1600 等級的 blitz、rapid、classical 對局計算 `常用度`，並使用 En Croissant 已安裝的 Stockfish depth 18 計算 `優劣程度`。Explorer 查詢使用官方 `explorer.lichess.org` 主機並依官方限制逐筆送出；結果與計算來源會寫回 `openings.yaml`，原始 Explorer 回覆只以 FEN 對局總數快取於 `build/opening-popularity-cache.json`。

Stockfish 評分會逐筆快取，主線未改變時不會重算。若尚未準備 Lichess token，也可先完成離線引擎評估：

```bash
.venv/bin/chess-library score-engine
```

若 Notion 已有完整 196 張卡，可只同步兩個百分比及 Gallery 排序，不重傳圖片、PGN 或頁面內文：

```bash
export NOTION_TOKEN='你的 integration token'
export NOTION_PARENT_PAGE_ID='你的父頁 ID'
.venv/bin/chess-library sync-notion-scores
```

若要重新產生 196 張卡的專屬教學計畫、常見錯誤與官方變例分歧重點：

```bash
.venv/bin/chess-library enrich-teaching
```

此命令不改動 Opening ID、主線、變例棋路或來源；重建 catalog 時也會自動套用同一套教學強化規則。

可隨時執行完整性稽核，檢查資料、資產、教學內容、評分快取與 Notion 部署收據：

```bash
.venv/bin/chess-library audit
```

若仍有未完成項目，命令會列在 `missing` 並以狀態碼 2 結束；全部驗收通過時才回傳 `status: complete`。

## 4. 匯入完整變例索引

完整索引以獨立 Notion 資料庫「西洋棋完整變例索引」呈現，保留主開局 Gallery 的閱讀性。每筆含標準變例名稱、ECO、根開局、完整 SAN 棋路、Variation ID、主開局連結與 En Croissant 分析連結。

```bash
export NOTION_TOKEN='你的 integration token'
export NOTION_PARENT_PAGE_ID='你的父頁 ID'
.venv/bin/chess-library import-variations-notion
```

匯入器依 `Variation ID` 安全續傳；中斷後直接重跑，已完成的列會保留，不會重複建立。預設最多三個並行請求，並沿用 Notion 429／5xx 退避重試。

## 安全與故障排除

- Notion 的分析連結只能呼叫允許清單內的 Opening ID，不能傳入檔名、路徑或 shell 指令。
- 橋接器拒絕非 loopback 綁定、錯誤密鑰與路徑穿越。
- 點擊分析連結顯示 403：重新執行匯入器，讓 Notion URL 與本機密鑰同步。
- 顯示找不到 En Croissant：確認官方應用程式 `en-croissant.app` 位於 Applications。
- Notion 回覆 404：確認父頁已分享給 integration。
- Notion 回覆 429／5xx：匯入器會依 `Retry-After` 或指數退避自動重試。

## 維護資料

`openings.yaml` 是正式資料；修改開局棋路後應重新執行 `score-openings`，再依序執行 `validate`、`build`、測試及 `import-notion`。`scripts/build_catalog.py` 是從 Lichess CC0 TSV 重建 196 筆資料的維護工具，不是一般使用流程，也不會在匯入時連網。
