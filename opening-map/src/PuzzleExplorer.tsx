import { useCallback, useEffect, useMemo, useState } from "react";
import { Chessboard } from "./Chessboard";

type NotionPuzzle = {
  id: string; title: string; fen: string; side: "白方" | "黑方"; themes: string[];
  previousFen?: string; previousMove?: string;
  difficulty: string; classification: string; deltaCp: number; wrongMove: string;
  stage: number; dueAt: string; attempts: number; accuracy: number;
  notionUrl: string; gameUrl: string;
};
type NotionPuzzleCatalog = { source: string; exportedAt: string; count: number; puzzles: NotionPuzzle[] };

const puzzleGroups = ["全部題目", "開局", "中局", "殘局", "進攻", "防守", "重大失誤"] as const;
type PuzzleGroup = typeof puzzleGroups[number];

function puzzleRound(puzzle: NotionPuzzle) {
  return Number(puzzle.title.match(/第\s*(\d+)\s*回合/)?.[1] ?? 0);
}

function inPuzzleGroup(puzzle: NotionPuzzle, group: PuzzleGroup) {
  const labels = `${puzzle.title} ${puzzle.themes.join(" ")} ${puzzle.classification}`;
  const round = puzzleRound(puzzle);
  if (group === "全部題目") return true;
  if (group === "開局") return /開局/.test(labels) || (round > 0 && round <= 12);
  if (group === "殘局") return /殘局/.test(labels) || round >= 40;
  if (group === "中局") return /中局/.test(labels) || (round > 12 && round < 40 && !/殘局/.test(labels));
  if (group === "進攻") return /進攻|攻擊|戰術|犧牲|將殺/.test(labels);
  if (group === "防守") return /防守|防禦/.test(labels);
  return /blunder|重大失誤/.test(labels);
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
  const [showStockfish, setShowStockfish] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [puzzleAnswer, setPuzzleAnswer] = useState<string | null>(null);
  const [answerVersion, setAnswerVersion] = useState(0);
  const [puzzleFeedback, setPuzzleFeedback] = useState<{ kind: "correct" | "wrong" | "pending"; text: string } | null>(null);
  const handlePuzzleBestMove = useCallback((move: string | null, fen: string) => {
    const expectedFen = catalog?.puzzles.find((puzzle) => puzzle.id === selectedId)?.fen;
    const position = (value?: string) => String(value || "").split(" ").slice(0, 4).join(" ");
    if (move && position(fen) === position(expectedFen)) setPuzzleAnswer((current) => current ?? move);
  }, [catalog, selectedId]);
  const configuredUrl = import.meta.env.VITE_PUZZLE_APP_URL?.trim();
  const puzzleUrl = configuredUrl || "http://127.0.0.1:8788/?tab=puzzles";
  useEffect(() => {
    fetch("./notion-puzzles.json").then((response) => response.ok ? response.json() : Promise.reject())
      .then((value: NotionPuzzleCatalog) => { setCatalog(value); setSelectedId(value.puzzles[0]?.id ?? null); })
      .catch(() => setLoadError(true));
  }, []);
  const themes = useMemo(() => catalog ? [...new Set(catalog.puzzles.flatMap((puzzle) => puzzle.themes))].sort((a, b) => a.localeCompare(b, "zh-Hant")) : [], [catalog]);
  const filtered = useMemo(() => {
    if (!catalog) return [];
    const needle = puzzleQuery.trim().toLowerCase();
    return catalog.puzzles.filter((puzzle) => inPuzzleGroup(puzzle, group)
      && (side === "全部" || puzzle.side === side)
      && (theme === "全部" || puzzle.themes.includes(theme))
      && (difficulty === "全部" || puzzle.difficulty === difficulty)
      && (!needle || `${puzzle.title} ${puzzle.id} ${puzzle.themes.join(" ")} ${puzzle.classification}`.toLowerCase().includes(needle)));
  }, [catalog, difficulty, group, puzzleQuery, side, theme]);
  useEffect(() => { setPage(1); }, [difficulty, group, puzzleQuery, side, theme]);
  useEffect(() => { setShowStockfish(false); setShowAnswer(false); setPuzzleAnswer(null); setPuzzleFeedback(null); }, [selectedId]);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = catalog?.puzzles.find((puzzle) => puzzle.id === selectedId) ?? null;
  const due = catalog?.puzzles.filter((puzzle) => new Date(puzzle.dueAt) <= new Date()).length ?? 0;
  const solveUrl = selected ? `${puzzleUrl}${puzzleUrl.includes("?") ? "&" : "?"}puzzle=${encodeURIComponent(selected.id)}` : puzzleUrl;
  return <section className="puzzle-explorer"><div className="concept-heading"><p className="eyebrow">NOTION PUZZLE LIBRARY</p><h2>個人化西洋棋謎題</h2><p>Notion「個人西洋棋謎題」已真正匯入地圖；可依陣營、主題與難度找題，並直接預覽實戰局面。</p></div>
    {loadError ? <div className="empty">無法載入 Notion 謎題匯出檔。</div> : !catalog ? <div className="loading-inline">正在載入 Notion 謎題…</div> : <>
      <div className="puzzle-stats"><span><b>{catalog.count.toLocaleString()}</b><small>Notion 題目</small></span><span><b>{due.toLocaleString()}</b><small>已到複習日</small></span><span><b>{themes.length}</b><small>戰術主題</small></span><a href="https://app.notion.com/p/63e9236b893e43d8bb58c71e70cece5a" target="_blank" rel="noreferrer">開啟 Notion 資料庫 ↗</a></div>
      <div className="puzzle-filters"><label><span>搜尋題目</span><input value={puzzleQuery} onChange={(event) => setPuzzleQuery(event.target.value)} placeholder="回合、主題或 Puzzle ID" /></label><Filter label="陣營" value={side} values={["全部", "白方", "黑方"]} onChange={setSide} /><Filter label="主題" value={theme} values={["全部", ...themes]} onChange={setTheme} /><Filter label="難度" value={difficulty} values={["全部", "初階", "中階"]} onChange={setDifficulty} /></div>
      <div className="puzzle-browser"><aside className="puzzle-big-groups" aria-label="謎題大群分類"><p className="eyebrow">大群分類</p><h3>依局面找題</h3>{puzzleGroups.map((item) => {
        const count = catalog.puzzles.filter((puzzle) => inPuzzleGroup(puzzle, item)).length;
        return <button className={group === item ? "active" : ""} key={item} onClick={() => setGroup(item)}><span>{item}</span><b>{count.toLocaleString()}</b></button>;
      })}</aside><div className={`notion-puzzle-layout ${selected ? "has-preview" : ""}`}>
        <div><div className="puzzle-result-heading"><b>{filtered.length.toLocaleString()} 題</b><small>目前篩選結果 · 第 {Math.min(page, pageCount)} / {pageCount} 頁</small></div><div className="notion-puzzle-grid">{visible.map((puzzle) => <button className={selectedId === puzzle.id ? "selected" : ""} key={puzzle.id} onClick={() => setSelectedId(puzzle.id)}><span className={puzzle.side === "白方" ? "white" : "black"}>{puzzle.side === "白方" ? "♙" : "♟"}</span><div><b>{puzzle.title}</b><small>{puzzle.themes.join(" · ")} · {puzzle.difficulty}</small><em>{puzzle.classification} · 損失 {puzzle.deltaCp} cp</em></div></button>)}</div><div className="puzzle-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← 上一頁</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁 →</button></div></div>
        {selected && <aside className="notion-puzzle-preview"><header><div><p className="eyebrow">NOTION PUZZLE</p><h3>{selected.title}</h3><small>{selected.side}走 · {selected.themes.join(" · ")} · {selected.difficulty}</small></div><span>階段 {selected.stage}</span></header>{selected.previousMove && <div className="puzzle-last-move"><span>對手上一手</span><b>{selected.previousMove}</b><small>先播放這一步，再輪到你</small></div>}<Chessboard key={`${selected.id}-${answerVersion}`} line={selected.previousFen && selected.previousMove ? selected.previousMove : ""} initialFen={selected.previousFen || selected.fen} initialStep={selected.previousFen && selected.previousMove ? 1 : 0} autoPlay={Boolean(selected.previousFen && selected.previousMove)} autoPlayFromStep={0} interactive analysis={showStockfish || showAnswer} orientation={selected.side === "黑方" ? "black" : "white"} onBestMove={handlePuzzleBestMove} onManualUndo={() => setPuzzleFeedback(null)} onManualMove={({ san }) => {
          const clean = (value: string) => value.replace(/[+#?!]+$/g, "").replace(/\s+/g, "");
          setPuzzleFeedback(!puzzleAnswer
            ? { kind: "pending", text: `Stockfish 還在核對答案，請按「←」返回並稍候再走一次。` }
            : clean(san) === clean(puzzleAnswer)
              ? { kind: "correct", text: `正確！${san} 與目前 Stockfish 最佳棋一致。` }
              : { kind: "wrong", text: `${san} 與目前 Stockfish 最佳棋 ${puzzleAnswer} 不同。請按「←」返回，再找一次。` });
        }} />{puzzleFeedback && <div className={`puzzle-feedback ${puzzleFeedback.kind}`} role="status"><span>{puzzleFeedback.kind === "correct" ? "✓" : "!"}</span><b>{puzzleFeedback.text}</b></div>}{showAnswer && <div className="puzzle-answer" role="status"><span>解答</span><b>{puzzleAnswer ? `最佳棋步：${puzzleAnswer}` : "Stockfish 正在計算最佳棋步…"}</b></div>}<div className="puzzle-preview-actions"><button className={showStockfish ? "active" : ""} onClick={() => setShowStockfish((value) => !value)}>{showStockfish ? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"}</button><button className={showAnswer ? "answer-active" : ""} onClick={() => { setShowAnswer((value) => !value); setPuzzleAnswer(null); setAnswerVersion((value) => value + 1); }}>{showAnswer ? "隱藏解答" : "查看解答"}</button><a href={solveUrl} target="_blank" rel="noreferrer">進入完整作答 ↗</a><a href={selected.notionUrl} target="_blank" rel="noreferrer">Notion 題目 ↗</a>{selected.gameUrl && <a href={selected.gameUrl} target="_blank" rel="noreferrer">來源棋局 ↗</a>}</div><p>{showStockfish || showAnswer ? "Stockfish 已開啟，可查看局面評估與建議下法。" : "先自己思考與走棋；走錯時會提示，可用棋盤下方的「←」返回。"}</p></aside>}
      </div></div>
    </>}
  </section>;
}


function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

