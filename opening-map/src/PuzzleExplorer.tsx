import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "./Chessboard";
import "./PuzzleExplorer.css";

type PuzzleSummary = {
  id: string; title: string; side: "白方" | "黑方"; themes: string[];
  difficulty: string; classification: string; deltaCp: number;
  stage: number; dueAt: string; chunk: number;
};
type PuzzleDetail = {
  id: string; fen: string; previousFen?: string; previousMove?: string; wrongMove: string;
  answerUci: string; answerSan: string; solutionLine: string[]; answerEngine: string; engineDepth: number;
  attempts: number; accuracy: number; notionUrl: string; gameUrl: string;
};
type NotionPuzzle = PuzzleSummary & PuzzleDetail;
type NotionPuzzleCatalog = { schemaVersion: 2; source: string; exportedAt: string; count: number; chunkSize: number; detailBase: string; puzzles: PuzzleSummary[] };
type PuzzleDetailChunk = { schemaVersion: 2; exportedAt: string; chunk: number; puzzles: PuzzleDetail[] };
type PuzzleSearchEntry = { puzzle: PuzzleSummary; searchText: string; groupMask: number };

const puzzleGroups = ["全部題目", "開局", "中局", "殘局", "進攻", "防守", "重大失誤"] as const;
type PuzzleGroup = typeof puzzleGroups[number];

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
  const [catalog, setCatalog] = useState<NotionPuzzleCatalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [puzzleQuery, setPuzzleQuery] = useState("");
  const [side, setSide] = useState("全部");
  const [theme, setTheme] = useState("全部");
  const [difficulty, setDifficulty] = useState("全部");
  const [group, setGroup] = useState<PuzzleGroup>("全部題目");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, PuzzleDetail>>({});
  const [detailErrorChunk, setDetailErrorChunk] = useState<number | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const pendingChunks = useRef(new Set<number>());
  const [showStockfish, setShowStockfish] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [puzzleFeedback, setPuzzleFeedback] = useState<{ kind: "correct" | "wrong"; text: string } | null>(null);
  const deferredQuery = useDeferredValue(puzzleQuery.trim().toLowerCase());
  const configuredUrl = import.meta.env.VITE_PUZZLE_APP_URL?.trim();
  const puzzleUrl = configuredUrl || "http://127.0.0.1:8788/?tab=puzzles";
  useEffect(() => {
    fetch("./notion-puzzles.json", { cache: "no-cache" }).then((response) => response.ok ? response.json() : Promise.reject())
      .then((value: NotionPuzzleCatalog) => {
        if (value.schemaVersion !== 2 || value.count !== value.puzzles.length) throw new Error("Invalid puzzle index");
        setCatalog(value);
        setSelectedId(value.puzzles[0]?.id ?? null);
      })
      .catch(() => setLoadError(true));
  }, []);
  const themes = useMemo(() => catalog ? [...new Set(catalog.puzzles.flatMap((puzzle) => puzzle.themes))].sort((a, b) => a.localeCompare(b, "zh-Hant")) : [], [catalog]);
  const searchData = useMemo(() => {
    const groupCounts = puzzleGroups.map(() => 0);
    const entries: PuzzleSearchEntry[] = (catalog?.puzzles ?? []).map((puzzle) => {
      const groupMask = puzzleGroupMask(puzzle);
      puzzleGroups.forEach((_, index) => { if (groupMask & (1 << index)) groupCounts[index] += 1; });
      return {
        puzzle,
        groupMask,
        searchText: `${puzzle.title} ${puzzle.id} ${puzzle.themes.join(" ")} ${puzzle.classification}`.toLowerCase(),
      };
    });
    return { entries, groupCounts };
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
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedSummary = filtered.find((puzzle) => puzzle.id === selectedId) ?? filtered[0] ?? null;
  useEffect(() => { if (selectedSummary?.id !== selectedId) setSelectedId(selectedSummary?.id ?? null); }, [selectedId, selectedSummary]);
  const selectedDetail = selectedSummary ? detailsById[selectedSummary.id] : null;
  const selected: NotionPuzzle | null = selectedSummary && selectedDetail ? { ...selectedSummary, ...selectedDetail } : null;
  useEffect(() => {
    if (!catalog || !selectedSummary || selectedDetail || pendingChunks.current.has(selectedSummary.chunk)) return;
    const chunk = selectedSummary.chunk;
    pendingChunks.current.add(chunk);
    setDetailErrorChunk((value) => value === chunk ? null : value);
    fetch(`./${catalog.detailBase}/chunk-${String(chunk).padStart(3, "0")}.json`, { cache: "no-cache" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value: PuzzleDetailChunk) => {
        if (value.schemaVersion !== 2 || value.exportedAt !== catalog.exportedAt || value.chunk !== chunk) throw new Error("Mismatched puzzle detail chunk");
        if (!value.puzzles.some((puzzle) => puzzle.id === selectedSummary.id)) throw new Error("Selected puzzle is missing from its detail chunk");
        setDetailsById((current) => ({ ...current, ...Object.fromEntries(value.puzzles.map((puzzle) => [puzzle.id, puzzle])) }));
      })
      .catch(() => setDetailErrorChunk(chunk))
      .finally(() => pendingChunks.current.delete(chunk));
  }, [catalog, detailRetry, selectedDetail, selectedSummary]);
  const due = useMemo(() => catalog?.puzzles.filter((puzzle) => new Date(puzzle.dueAt) <= new Date()).length ?? 0, [catalog]);
  const solveUrl = selectedSummary ? `${puzzleUrl}${puzzleUrl.includes("?") ? "&" : "?"}puzzle=${encodeURIComponent(selectedSummary.id)}` : puzzleUrl;
  return <section className="puzzle-explorer"><div className="concept-heading"><p className="eyebrow">NOTION PUZZLE LIBRARY</p><h2>個人化西洋棋謎題</h2><p>Notion「個人西洋棋謎題」已真正匯入地圖；可依陣營、主題與難度找題，並直接預覽實戰局面。</p></div>
    {loadError ? <div className="empty">無法載入 Notion 謎題匯出檔。</div> : !catalog ? <div className="loading-inline">正在載入 Notion 謎題…</div> : <>
      <div className="puzzle-stats"><span><b>{catalog.count.toLocaleString()}</b><small>Notion 題目</small></span><span><b>{due.toLocaleString()}</b><small>已到複習日</small></span><span><b>{themes.length}</b><small>戰術主題</small></span><a href="https://app.notion.com/p/63e9236b893e43d8bb58c71e70cece5a" target="_blank" rel="noreferrer">開啟 Notion 資料庫 ↗</a></div>
      <div className="puzzle-filters"><label><span>搜尋題目</span><input value={puzzleQuery} onChange={(event) => setPuzzleQuery(event.target.value)} placeholder="回合、主題或 Puzzle ID" /></label><Filter label="陣營" value={side} values={["全部", "白方", "黑方"]} onChange={setSide} /><Filter label="主題" value={theme} values={["全部", ...themes]} onChange={setTheme} /><Filter label="難度" value={difficulty} values={["全部", "初階", "中階"]} onChange={setDifficulty} /></div>
      <div className="puzzle-browser"><aside className="puzzle-big-groups" aria-label="謎題大群分類"><p className="eyebrow">大群分類</p><h3>依局面找題</h3>{puzzleGroups.map((item) => {
        const count = searchData.groupCounts[puzzleGroups.indexOf(item)];
        return <button className={group === item ? "active" : ""} aria-pressed={group === item} key={item} onClick={() => setGroup(item)}><span>{item}</span><b>{count.toLocaleString()}</b></button>;
      })}</aside><div className={`notion-puzzle-layout ${selectedSummary ? "has-preview" : ""}`}>
        <div><div className="puzzle-result-heading" aria-live="polite"><b>{filtered.length.toLocaleString()} 題</b><small>目前篩選結果 · 第 {safePage} / {pageCount} 頁</small></div><div className="notion-puzzle-grid">{visible.map((puzzle) => <button className={selectedSummary?.id === puzzle.id ? "selected" : ""} aria-pressed={selectedSummary?.id === puzzle.id} key={puzzle.id} onClick={() => setSelectedId(puzzle.id)}><span className={puzzle.side === "白方" ? "white" : "black"}>{puzzle.side === "白方" ? "♙" : "♟"}</span><div><b>{puzzle.title}</b><small>{puzzle.themes.join(" · ")} · {puzzle.difficulty}</small><em>{puzzle.classification} · 損失 {puzzle.deltaCp} cp</em></div></button>)}</div><nav className="puzzle-pagination" aria-label="謎題分頁"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← 上一頁</button><span>{safePage} / {pageCount}</span><button disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁 →</button></nav></div>
        {selectedSummary && !selected && <aside className="notion-puzzle-preview puzzle-detail-state" role="status" aria-live="polite"><p className="eyebrow">NOTION PUZZLE</p><h3>{selectedSummary.title}</h3>{detailErrorChunk === selectedSummary.chunk ? <><p>題目棋盤資料載入失敗。</p><button type="button" onClick={() => setDetailRetry((value) => value + 1)}>重新載入題目</button></> : <div className="loading-inline">正在載入棋盤與解答…</div>}</aside>}
        {selected && <aside className="notion-puzzle-preview"><header><div><p className="eyebrow">NOTION PUZZLE</p><h3>{selected.title}</h3><small>{selected.side}走 · {selected.themes.join(" · ")} · {selected.difficulty}</small></div><span>階段 {selected.stage}</span></header>{selected.previousMove && <div className="puzzle-last-move"><span>對手上一手</span><b>{selected.previousMove}</b><small>先播放這一步，再輪到你</small></div>}<Chessboard key={selected.id} line={selected.previousFen && selected.previousMove ? selected.previousMove : ""} initialFen={selected.previousFen || selected.fen} initialStep={selected.previousFen && selected.previousMove ? 1 : 0} autoPlay={Boolean(selected.previousFen && selected.previousMove)} autoPlayFromStep={0} interactive analysis={showStockfish} preferredBestMove={selected.answerUci} preferredBestMoveFen={selected.fen} orientation={selected.side === "黑方" ? "black" : "white"} onManualUndo={() => setPuzzleFeedback(null)} onManualMove={({ san }) => {
          const clean = (value: string) => value.replace(/[+#?!]+$/g, "").replace(/\s+/g, "");
          setPuzzleFeedback(clean(san) === clean(selected.answerSan)
            ? { kind: "correct", text: `正確！${san} 與 Stockfish 深度 ${selected.engineDepth} 最佳棋一致。` }
            : { kind: "wrong", text: `${san} 與 Stockfish 深度 ${selected.engineDepth} 最佳棋 ${selected.answerSan} 不同。請按「←」返回，再找一次。` });
        }} />{puzzleFeedback && <div className={`puzzle-feedback ${puzzleFeedback.kind}`} role="status"><span>{puzzleFeedback.kind === "correct" ? "✓" : "!"}</span><b>{puzzleFeedback.text}</b></div>}{showAnswer && <div className="puzzle-answer" role="status"><span>Stockfish 深度 {selected.engineDepth}</span><div><b>最佳棋步：{selected.answerSan}</b><small>建議延伸：{selected.solutionLine.join(" ")}</small></div></div>}<div className="puzzle-preview-actions"><button className={showStockfish ? "active" : ""} aria-pressed={showStockfish} onClick={() => setShowStockfish((value) => !value)}>{showStockfish ? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"}</button><button className={showAnswer ? "answer-active" : ""} aria-pressed={showAnswer} onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "隱藏解答" : "查看解答"}</button><a href={solveUrl} target="_blank" rel="noreferrer">進入完整作答 ↗</a><a href={selected.notionUrl} target="_blank" rel="noreferrer">Notion 題目 ↗</a>{selected.gameUrl && <a href={selected.gameUrl} target="_blank" rel="noreferrer">來源棋局 ↗</a>}</div><p>{showStockfish ? "Stockfish 已開啟，可查看局面評估與建議下法。" : showAnswer ? `已顯示資料庫中 Stockfish 深度 ${selected.engineDepth} 的已驗證解答。` : "先自己思考與走棋；走錯時會提示，可用棋盤下方的「←」返回。"}</p></aside>}
      </div></div>
    </>}
  </section>;
}


function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
