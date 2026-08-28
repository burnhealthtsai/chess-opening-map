import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Chessboard } from "./Chessboard";
import "./PuzzleExplorer.css";

type PuzzleSummary = {
  id: string; title: string; side: "白方" | "黑方"; themes: string[];
  difficulty: string; classification: string; deltaCp: number;
  stage: number; chunk: number;
};
type PuzzleDetail = {
  id: string; fen: string; previousFen?: string; previousMove?: string; wrongMove: string;
  answerUci: string; answerSan: string; solutionLine: string[]; answerEngine: string; engineDepth: number;
  attempts: number; accuracy: number; notionUrl: string; gameUrl: string;
};
type NotionPuzzle = PuzzleSummary & PuzzleDetail;
type PackedPuzzleSummary = [string, number, number, number[], number, number, number, number];
type PuzzleDictionaries = { titles: string[]; sides: Array<"白方" | "黑方">; themes: string[]; difficulties: string[]; classifications: string[] };
type PuzzleCatalogMetadata = {
  schemaVersion: 3; source: string; exportedAt: string; count: number; chunkSize: number;
  initialSummaryPath: string; searchPath: string; detailBase: string; dictionaries: PuzzleDictionaries;
  groupCounts: number[]; dueSchedule: Array<[string, number]>;
};
type NotionPuzzleCatalog = PuzzleCatalogMetadata & { puzzles: PuzzleSummary[]; complete: boolean };
type PuzzleSummaryChunk = { schemaVersion: 3; exportedAt: string; chunk: number; puzzles: PackedPuzzleSummary[] };
type PuzzleSearchCatalog = { schemaVersion: 3; exportedAt: string; puzzles: PackedPuzzleSummary[] };
type PuzzleDetailChunk = { schemaVersion: 2; exportedAt: string; chunk: number; puzzles: PuzzleDetail[] };
type PuzzleSearchEntry = { puzzle: PuzzleSummary; searchText: string; groupMask: number };

const puzzleGroups = ["全部題目", "開局", "中局", "殘局", "進攻", "防守", "重大失誤"] as const;
type PuzzleGroup = typeof puzzleGroups[number];
type PuzzleViewState = { query: string; side: string; theme: string; difficulty: string; group: PuzzleGroup; page: number; selectedId: string | null };

let cachedCatalog: NotionPuzzleCatalog | null = null;
let catalogRequest: Promise<NotionPuzzleCatalog> | null = null;
const summaryChunkRequests = new Map<string, Promise<PuzzleSummary[]>>();
const cachedDetails: Record<string, PuzzleDetail> = {};
const detailChunkRequests = new Map<string, Promise<PuzzleDetailChunk>>();
let puzzleViewState: PuzzleViewState = { query: "", side: "全部", theme: "全部", difficulty: "全部", group: "全部題目", page: 1, selectedId: null };

function decodePuzzleSummaries(catalog: PuzzleCatalogMetadata, records: PackedPuzzleSummary[], complete: boolean) {
  return records.map((record, position) => {
    if (!Array.isArray(record) || record.length !== 8) throw new Error("Invalid packed puzzle summary");
    const [id, title, side, themes, difficulty, classification, deltaCp, stage] = record;
    const decoded = {
      id,
      title: catalog.dictionaries.titles[title],
      side: catalog.dictionaries.sides[side],
      themes: Array.isArray(themes) ? themes.map((index) => catalog.dictionaries.themes[index]) : [],
      difficulty: catalog.dictionaries.difficulties[difficulty],
      classification: catalog.dictionaries.classifications[classification],
      deltaCp,
      stage,
      chunk: complete ? Math.floor(position / catalog.chunkSize) : 0,
    };
    if (!decoded.id || !decoded.title || !decoded.side || !decoded.themes.length || decoded.themes.some((theme) => !theme)
      || !decoded.difficulty || !decoded.classification || !Number.isFinite(decoded.deltaCp) || !Number.isFinite(decoded.stage)) {
      throw new Error("Puzzle summary references an invalid dictionary value");
    }
    return decoded;
  });
}

function loadPuzzleSummaryChunk(catalog: PuzzleCatalogMetadata) {
  const key = `${catalog.exportedAt}:initial`;
  const existing = summaryChunkRequests.get(key);
  if (existing) return existing;
  const request = fetch(`./${catalog.initialSummaryPath}`, { cache: "no-cache" })
    .then((response) => response.ok ? response.json() as Promise<PuzzleSummaryChunk> : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((value) => {
      if (value.schemaVersion !== 3 || value.exportedAt !== catalog.exportedAt || value.chunk !== 0 || value.puzzles.length > catalog.chunkSize) {
        throw new Error("Mismatched initial puzzle summary");
      }
      return decodePuzzleSummaries(catalog, value.puzzles, false);
    })
    .catch((error) => { summaryChunkRequests.delete(key); throw error; });
  summaryChunkRequests.set(key, request);
  return request;
}

function loadAllPuzzleSummaries(catalog: NotionPuzzleCatalog) {
  if (catalog.complete) return Promise.resolve(catalog);
  const key = `${catalog.exportedAt}:complete`;
  const existing = summaryChunkRequests.get(key);
  const request = existing ?? fetch(`./${catalog.searchPath}`, { cache: "no-cache" })
    .then((response) => response.ok ? response.json() as Promise<PuzzleSearchCatalog> : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((value) => {
      if (value.schemaVersion !== 3 || value.exportedAt !== catalog.exportedAt || value.puzzles.length !== catalog.count) {
        throw new Error("Mismatched complete puzzle search index");
      }
      return decodePuzzleSummaries(catalog, value.puzzles, true);
    })
    .catch((error) => { summaryChunkRequests.delete(key); throw error; });
  if (!existing) summaryChunkRequests.set(key, request);
  return request.then((puzzles) => {
    const complete = { ...catalog, puzzles, complete: true };
    if (complete.puzzles.length !== complete.count) throw new Error("Incomplete puzzle summary catalog");
    cachedCatalog = complete;
    return complete;
  });
}

function loadPuzzleCatalog(force = false) {
  if (force) { cachedCatalog = null; catalogRequest = null; summaryChunkRequests.clear(); }
  if (cachedCatalog) return Promise.resolve(cachedCatalog);
  if (catalogRequest) return catalogRequest;
  catalogRequest = fetch("./notion-puzzles.json", { cache: "no-cache" })
    .then((response) => response.ok ? response.json() as Promise<PuzzleCatalogMetadata> : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(async (metadata) => {
      if (metadata.schemaVersion !== 3 || metadata.count <= 0 || metadata.chunkSize <= 0 || !metadata.initialSummaryPath || !metadata.searchPath
        || !Array.isArray(metadata.groupCounts) || metadata.groupCounts.length !== puzzleGroups.length
        || !Array.isArray(metadata.dueSchedule) || !metadata.dictionaries || Object.values(metadata.dictionaries).some((values) => !Array.isArray(values) || !values.length)) {
        throw new Error("Invalid puzzle index");
      }
      const puzzles = await loadPuzzleSummaryChunk(metadata);
      const value = { ...metadata, puzzles, complete: metadata.count <= metadata.chunkSize };
      cachedCatalog = value;
      return value;
    })
    .catch((error) => { catalogRequest = null; throw error; });
  return catalogRequest;
}

function loadPuzzleDetailChunk(catalog: NotionPuzzleCatalog, chunk: number) {
  const key = `${catalog.exportedAt}:${chunk}`;
  const existing = detailChunkRequests.get(key);
  if (existing) return existing;
  const request = fetch(`./${catalog.detailBase}/chunk-${String(chunk).padStart(3, "0")}.json`, { cache: "no-cache" })
    .then((response) => response.ok ? response.json() as Promise<PuzzleDetailChunk> : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((value) => {
      if (value.schemaVersion !== 2 || value.exportedAt !== catalog.exportedAt || value.chunk !== chunk) throw new Error("Mismatched puzzle detail chunk");
      return value;
    })
    .catch((error) => { detailChunkRequests.delete(key); throw error; });
  detailChunkRequests.set(key, request);
  return request;
}

function puzzleGroupMask(puzzle: PuzzleSummary) {
  const labels = `${puzzle.title} ${puzzle.themes.join(" ")} ${puzzle.classification}`;
  const round = Number(puzzle.title.match(/第\s*(\d+)\s*回合/)?.[1] ?? 0);
  const matches = [
    true,
    /開局/.test(labels) || (round > 0 && round <= 12),
    /中局/.test(labels) || (round > 12 && round < 40 && !/殘局/.test(labels)),
    /殘局/.test(labels) || round >= 40,
    /進攻|攻擊|戰術|犧牲|將殺/.test(labels),
    /防守|防禦/.test(labels),
    /blunder|重大失誤/.test(labels),
  ];
  return matches.reduce((mask, match, index) => match ? mask | (1 << index) : mask, 0);
}

export default function PuzzleExplorer() {
  const [catalog, setCatalog] = useState<NotionPuzzleCatalog | null>(cachedCatalog);
  const [loadError, setLoadError] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [fullIndexLoading, setFullIndexLoading] = useState(false);
  const [fullIndexError, setFullIndexError] = useState(false);
  const [fullIndexRetry, setFullIndexRetry] = useState(0);
  const [puzzleQuery, setPuzzleQuery] = useState(puzzleViewState.query);
  const [side, setSide] = useState(puzzleViewState.side);
  const [theme, setTheme] = useState(puzzleViewState.theme);
  const [difficulty, setDifficulty] = useState(puzzleViewState.difficulty);
  const [group, setGroup] = useState<PuzzleGroup>(puzzleViewState.group);
  const [page, setPage] = useState(puzzleViewState.page);
  const [selectedId, setSelectedId] = useState<string | null>(puzzleViewState.selectedId);
  const [detailsById, setDetailsById] = useState<Record<string, PuzzleDetail>>(() => ({ ...cachedDetails }));
  const [detailErrorChunk, setDetailErrorChunk] = useState<number | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [showStockfish, setShowStockfish] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [puzzleFeedback, setPuzzleFeedback] = useState<{ kind: "correct" | "wrong"; text: string } | null>(null);
  const deferredQuery = useDeferredValue(puzzleQuery.trim().toLowerCase());
  const configuredUrl = import.meta.env.VITE_PUZZLE_APP_URL?.trim();
  const puzzleUrl = configuredUrl || "http://127.0.0.1:8788/?tab=puzzles";
  useEffect(() => {
    if (catalog) return;
    let active = true;
    setLoadError(false);
    loadPuzzleCatalog(catalogRetry > 0)
      .then((value) => {
        if (!active) return;
        setCatalog(value);
        setSelectedId((current) => current ?? value.puzzles[0]?.id ?? null);
      })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [catalog, catalogRetry]);
  useEffect(() => {
    puzzleViewState = { query: puzzleQuery, side, theme, difficulty, group, page, selectedId };
  }, [difficulty, group, page, puzzleQuery, selectedId, side, theme]);
  const pageSize = 24;
  const loadedPageCount = Math.floor((catalog?.puzzles.length ?? 0) / pageSize);
  const needsFullCatalog = Boolean(catalog && !catalog.complete && (
    puzzleQuery.trim() || side !== "全部" || theme !== "全部" || difficulty !== "全部" || group !== "全部題目"
    || page > loadedPageCount || (selectedId && !catalog.puzzles.some((puzzle) => puzzle.id === selectedId))
  ));
  useEffect(() => {
    if (!catalog || !needsFullCatalog || catalog.complete) return;
    let active = true;
    setFullIndexLoading(true);
    setFullIndexError(false);
    loadAllPuzzleSummaries(catalog)
      .then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) setFullIndexError(true); })
      .finally(() => { if (active) setFullIndexLoading(false); });
    return () => { active = false; };
  }, [catalog, fullIndexRetry, needsFullCatalog]);
  const themes = useMemo(() => catalog ? [...catalog.dictionaries.themes].sort((a, b) => a.localeCompare(b, "zh-Hant")) : [], [catalog]);
  const searchData = useMemo(() => {
    const entries: PuzzleSearchEntry[] = (catalog?.puzzles ?? []).map((puzzle) => {
      const groupMask = puzzleGroupMask(puzzle);
      return {
        puzzle,
        groupMask,
        searchText: `${puzzle.title} ${puzzle.id} ${puzzle.themes.join(" ")} ${puzzle.classification}`.toLowerCase(),
      };
    });
    return { entries };
  }, [catalog]);
  const filtered = useMemo(() => {
    const groupIndex = puzzleGroups.indexOf(group);
    return searchData.entries.filter(({ puzzle, searchText, groupMask }) => Boolean(groupMask & (1 << groupIndex))
      && (side === "全部" || puzzle.side === side)
      && (theme === "全部" || puzzle.themes.includes(theme))
      && (difficulty === "全部" || puzzle.difficulty === difficulty)
      && (!deferredQuery || searchText.includes(deferredQuery))).map(({ puzzle }) => puzzle);
  }, [deferredQuery, difficulty, group, searchData, side, theme]);
  useEffect(() => { setPage(1); }, [difficulty, group, puzzleQuery, side, theme]);
  useEffect(() => { setShowStockfish(false); setShowAnswer(false); setPuzzleFeedback(null); }, [selectedId]);
  const partialDefaultView = Boolean(catalog && !catalog.complete && !needsFullCatalog);
  const filteredCount = partialDefaultView ? catalog?.count ?? 0 : filtered.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedSummary = filtered.find((puzzle) => puzzle.id === selectedId) ?? (needsFullCatalog ? null : filtered[0]) ?? null;
  useEffect(() => {
    if (needsFullCatalog) return;
    if (selectedSummary?.id !== selectedId) setSelectedId(selectedSummary?.id ?? null);
  }, [needsFullCatalog, selectedId, selectedSummary]);
  const selectedDetail = selectedSummary ? detailsById[selectedSummary.id] : null;
  const selected: NotionPuzzle | null = selectedSummary && selectedDetail ? { ...selectedSummary, ...selectedDetail } : null;
  useEffect(() => {
    if (!catalog || !selectedSummary || selectedDetail) return;
    const chunk = selectedSummary.chunk;
    let active = true;
    setDetailErrorChunk((value) => value === chunk ? null : value);
    loadPuzzleDetailChunk(catalog, chunk)
      .then((value: PuzzleDetailChunk) => {
        if (!value.puzzles.some((puzzle) => puzzle.id === selectedSummary.id)) throw new Error("Selected puzzle is missing from its detail chunk");
        Object.assign(cachedDetails, Object.fromEntries(value.puzzles.map((puzzle) => [puzzle.id, puzzle])));
        if (active) {
          setDetailsById((current) => ({ ...current, ...cachedDetails }));
          setDetailErrorChunk(null);
        }
      })
      .catch(() => { if (active) setDetailErrorChunk(chunk); });
    return () => { active = false; };
  }, [catalog, detailRetry, selectedDetail, selectedSummary]);
  const due = useMemo(() => catalog?.dueSchedule.reduce((count, [date, total]) => (
    Date.parse(`${date}T00:00:00Z`) <= Date.now() ? count + total : count
  ), 0) ?? 0, [catalog]);
  const solveUrl = selectedSummary ? `${puzzleUrl}${puzzleUrl.includes("?") ? "&" : "?"}puzzle=${encodeURIComponent(selectedSummary.id)}` : puzzleUrl;
  return <section className="puzzle-explorer"><div className="concept-heading"><p className="eyebrow">NOTION PUZZLE LIBRARY</p><h2>個人化西洋棋謎題</h2><p>Notion「個人西洋棋謎題」已真正匯入地圖；可依陣營、主題與難度找題，並直接預覽實戰局面。</p></div>
    {loadError ? <div className="empty" role="alert"><b>無法載入 Notion 謎題匯出檔。</b><button className="clear-button" onClick={() => setCatalogRetry((value) => value + 1)}>重新載入謎題</button></div> : !catalog ? <div className="loading-inline" role="status">正在載入 Notion 謎題…</div> : <>
      <div className="puzzle-stats"><span><b>{catalog.count.toLocaleString()}</b><small>Notion 題目</small></span><span><b>{due.toLocaleString()}</b><small>已到複習日</small></span><span><b>{themes.length}</b><small>戰術主題</small></span><a href="https://app.notion.com/p/63e9236b893e43d8bb58c71e70cece5a" target="_blank" rel="noreferrer">開啟 Notion 資料庫 ↗</a></div>
      <div className="puzzle-filters"><label><span>搜尋題目</span><input value={puzzleQuery} onChange={(event) => setPuzzleQuery(event.target.value)} placeholder="回合、主題或 Puzzle ID" /></label><Filter label="陣營" value={side} values={["全部", "白方", "黑方"]} onChange={setSide} /><Filter label="主題" value={theme} values={["全部", ...themes]} onChange={setTheme} /><Filter label="難度" value={difficulty} values={["全部", "初階", "中階"]} onChange={setDifficulty} /></div>
      <div className="puzzle-browser"><aside className="puzzle-big-groups" aria-label="謎題大群分類"><p className="eyebrow">大群分類</p><h3>依局面找題</h3>{puzzleGroups.map((item) => {
        const count = catalog.groupCounts[puzzleGroups.indexOf(item)];
        return <button className={group === item ? "active" : ""} aria-pressed={group === item} key={item} onClick={() => setGroup(item)}><span>{item}</span><b>{count.toLocaleString()}</b></button>;
      })}</aside>{needsFullCatalog ? <div className="puzzle-index-state" role={fullIndexError ? "alert" : "status"}>{fullIndexError ? <><b>完整搜尋索引載入失敗。</b><button type="button" onClick={() => setFullIndexRetry((value) => value + 1)}>重新載入搜尋索引</button></> : <><span className="loading-inline">正在載入完整搜尋索引…</span><small>{fullIndexLoading ? `整理 ${catalog.count.toLocaleString()} 題，完成後立即套用篩選。` : "準備搜尋索引…"}</small></>}</div> : <div className={`notion-puzzle-layout ${selectedSummary ? "has-preview" : ""}`}>
        <div><div className="puzzle-result-heading" aria-live="polite"><b>{filteredCount.toLocaleString()} 題</b><small>目前篩選結果 · 第 {safePage} / {pageCount} 頁</small></div><div className="notion-puzzle-grid">{visible.map((puzzle) => <button className={selectedSummary?.id === puzzle.id ? "selected" : ""} aria-pressed={selectedSummary?.id === puzzle.id} key={puzzle.id} onClick={() => setSelectedId(puzzle.id)}><span className={puzzle.side === "白方" ? "white" : "black"}>{puzzle.side === "白方" ? "♙" : "♟"}</span><div><b>{puzzle.title}</b><small>{puzzle.themes.join(" · ")} · {puzzle.difficulty}</small><em>{puzzle.classification} · 損失 {puzzle.deltaCp} cp</em></div></button>)}</div><nav className="puzzle-pagination" aria-label="謎題分頁"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← 上一頁</button><span>{safePage} / {pageCount}</span><button disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁 →</button></nav></div>
        {selectedSummary && !selected && <aside className="notion-puzzle-preview puzzle-detail-state" role="status" aria-live="polite"><p className="eyebrow">NOTION PUZZLE</p><h3>{selectedSummary.title}</h3>{detailErrorChunk === selectedSummary.chunk ? <><p>題目棋盤資料載入失敗。</p><button type="button" onClick={() => setDetailRetry((value) => value + 1)}>重新載入題目</button></> : <div className="loading-inline">正在載入棋盤與解答…</div>}</aside>}
        {selected && <aside className="notion-puzzle-preview"><header><div><p className="eyebrow">NOTION PUZZLE</p><h3>{selected.title}</h3><small>{selected.side}走 · {selected.themes.join(" · ")} · {selected.difficulty}</small></div><span>階段 {selected.stage}</span></header>{selected.previousMove && <div className="puzzle-last-move"><span>對手上一手</span><b>{selected.previousMove}</b><small>先播放這一步，再輪到你</small></div>}<Chessboard key={selected.id} line={selected.previousFen && selected.previousMove ? selected.previousMove : ""} initialFen={selected.previousFen || selected.fen} initialStep={selected.previousFen && selected.previousMove ? 1 : 0} autoPlay={Boolean(selected.previousFen && selected.previousMove)} autoPlayFromStep={0} interactive analysis={showStockfish} preferredBestMove={selected.answerUci} preferredBestMoveFen={selected.fen} orientation={selected.side === "黑方" ? "black" : "white"} onManualUndo={() => setPuzzleFeedback(null)} onManualMove={({ san }) => {
          const clean = (value: string) => value.replace(/[+#?!]+$/g, "").replace(/\s+/g, "");
          setPuzzleFeedback(clean(san) === clean(selected.answerSan)
            ? { kind: "correct", text: `正確！${san} 與 Stockfish 深度 ${selected.engineDepth} 最佳棋一致。` }
            : { kind: "wrong", text: `${san} 與 Stockfish 深度 ${selected.engineDepth} 最佳棋 ${selected.answerSan} 不同。請按「←」返回，再找一次。` });
        }} />{puzzleFeedback && <div className={`puzzle-feedback ${puzzleFeedback.kind}`} role="status"><span>{puzzleFeedback.kind === "correct" ? "✓" : "!"}</span><b>{puzzleFeedback.text}</b></div>}{showAnswer && <div className="puzzle-answer" role="status"><span>Stockfish 深度 {selected.engineDepth}</span><div><b>最佳棋步：{selected.answerSan}</b><small>建議延伸：{selected.solutionLine.join(" ")}</small></div></div>}<div className="puzzle-preview-actions"><button className={showStockfish ? "active" : ""} aria-pressed={showStockfish} onClick={() => setShowStockfish((value) => !value)}>{showStockfish ? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"}</button><button className={showAnswer ? "answer-active" : ""} aria-pressed={showAnswer} onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "隱藏解答" : "查看解答"}</button><a href={solveUrl} target="_blank" rel="noreferrer">進入完整作答 ↗</a><a href={selected.notionUrl} target="_blank" rel="noreferrer">Notion 題目 ↗</a>{selected.gameUrl && <a href={selected.gameUrl} target="_blank" rel="noreferrer">來源棋局 ↗</a>}</div><p>{showStockfish ? "Stockfish 已開啟，可查看局面評估與建議下法。" : showAnswer ? `已顯示資料庫中 Stockfish 深度 ${selected.engineDepth} 的已驗證解答。` : "先自己思考與走棋；走錯時會提示，可用棋盤下方的「←」返回。"}</p></aside>}
      </div>}</div>
    </>}
  </section>;
}


function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
