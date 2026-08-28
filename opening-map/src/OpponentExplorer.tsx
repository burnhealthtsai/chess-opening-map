import { useMemo, useState } from "react";
import { Chessboard } from "./Chessboard";
import "./OpponentExplorer.css";
import { openingIcon } from "./openingIcon";
import type { Opening, OpeningMapData } from "./types";

function lineMoves(line: string) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

const opponentLevels = [
  { value: 1 as const, name: "入門", opponent: "小兵阿洛", rating: "約 600", text: "會選擇合法棋步，偶爾錯過戰術。" },
  { value: 2 as const, name: "進階", opponent: "戰術騎士凱", rating: "約 1200", text: "多數時候採用引擎建議，也會留下實戰機會。" },
  { value: 3 as const, name: "高手", opponent: "深藍大師", rating: "約 1800+", text: "優先採用 Stockfish 最佳棋步。" },
];

type PracticePosition = { fen: string; moves: string[] };
type BookSuggestion = { move: string; targets: Opening[] };

function normalizeBookMove(move: string) { return move.replace(/[+#?!]+$/g, "").replace(/0-0-0/g, "O-O-O").replace(/0-0/g, "O-O"); }
function bookMovePiece(move: string, side: "白方" | "黑方") {
  const piece = normalizeBookMove(move).match(/^[KQRBN]/)?.[0] ?? "P";
  const icons = side === "白方"
    ? { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" }
    : { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
  return icons[piece as keyof typeof icons];
}
function commonBookPrefix(left: string[], right: string[]) {
  let length = 0;
  while (length < left.length && length < right.length && normalizeBookMove(left[length]) === normalizeBookMove(right[length])) length += 1;
  return length;
}
function openingBook(data: OpeningMapData) {
  return data.nodes.flatMap((opening) => [opening.mainline, ...opening.variations.map((variation) => variation.line)]
    .map((line) => ({ opening, moves: lineMoves(line) })));
}
function recognizeOpening(data: OpeningMapData, played: string[]) {
  const book = openingBook(data);
  const exact = book.filter((candidate) => commonBookPrefix(candidate.moves, played) === played.length && candidate.moves.length >= played.length);
  const closest = played.length ? [...book].sort((left, right) => {
    const prefix = commonBookPrefix(right.moves, played) - commonBookPrefix(left.moves, played);
    return prefix || left.opening.title_zh.length - right.opening.title_zh.length || left.opening.eco.localeCompare(right.opening.eco);
  })[0] : null;
  const grouped = new Map<string, Map<string, Opening>>();
  for (const candidate of exact) {
    const next = candidate.moves[played.length];
    if (!next) continue;
    const key = normalizeBookMove(next);
    const targets = grouped.get(key) ?? new Map<string, Opening>();
    targets.set(candidate.opening.id, candidate.opening);
    grouped.set(key, targets);
  }
  const suggestions: BookSuggestion[] = [...grouped].map(([move, targets]) => ({ move, targets: [...targets.values()] }))
    .sort((left, right) => right.targets.length - left.targets.length || left.move.localeCompare(right.move)).slice(0, 6);
  return { closest: closest?.opening ?? null, exact: exact.length > 0, suggestions };
}

function OpeningRecognition({ data, position }: { data: OpeningMapData; position: PracticePosition }) {
  const recognition = useMemo(() => recognizeOpening(data, position.moves), [data, position.moves]);
  const side = position.moves.length % 2 === 0 ? "白方" : "黑方";
  return <section className="opening-recognition" aria-live="polite"><header><div><p className="eyebrow">OPENING GUIDE</p><h3>目前接近的開局</h3></div><span>{side}走</span></header>
    {recognition.closest ? <div className={`recognized-opening ${recognition.exact ? "book" : "off-book"}`}><span>{recognition.closest.eco}</span><div><b>{openingIcon(recognition.closest.title_zh, recognition.closest.title_en) && <i aria-hidden="true">{openingIcon(recognition.closest.title_zh, recognition.closest.title_en)}</i>}{recognition.closest.title_zh}</b><small>{recognition.exact ? "仍在開局資料庫路線中" : "已偏離主線，這是目前最相近的路線"}</small></div></div> : <p className="recognition-empty">走出第一步後，這裡會開始辨識開局。</p>}
    <div className="book-next"><h4>可以怎麼下，會變成什麼開局</h4>{recognition.suggestions.length ? <div>{recognition.suggestions.map((suggestion) => <article key={suggestion.move}><strong className={side === "白方" ? "white" : "black"}><i aria-hidden="true">{bookMovePiece(suggestion.move, side)}</i><span>{suggestion.move}</span></strong><span aria-hidden="true">→</span><p>{suggestion.targets.slice(0, 3).map((opening) => opening.title_zh).join("／")}{suggestion.targets.length > 3 ? ` 等 ${suggestion.targets.length} 種` : ""}</p></article>)}</div> : <p>{position.moves.length ? "目前已離開已收錄的固定棋路；可參考棋盤下方 Stockfish 的局面建議。" : "走棋後會列出可轉入的開局與變例。"}</p>}</div>
  </section>;
}

function chessComProfile(value: string) {
  const account = value.trim().replace(/^@/, "");
  if (!account) return "";
  try {
    const url = new URL(account.startsWith("http") ? account : `https://www.chess.com/member/${encodeURIComponent(account)}`);
    return url.hostname === "chess.com" || url.hostname.endsWith(".chess.com") ? url.href : "";
  } catch { return ""; }
}

export default function OpponentExplorer({ data }: { data: OpeningMapData }) {
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [matchMode, setMatchMode] = useState<"normal" | "blind">("normal");
  const [blindStockfish, setBlindStockfish] = useState(false);
  const [game, setGame] = useState(0);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [playerName, setPlayerName] = useState("我的棋手");
  const [opponentName, setOpponentName] = useState(opponentLevels[0].opponent);
  const [chessComAccount, setChessComAccount] = useState("");
  const [position, setPosition] = useState<PracticePosition>({ fen: "", moves: [] });
  function chooseLevel(item: typeof opponentLevels[number]) { setLevel(item.value); setOpponentName(item.opponent); setGame((value) => value + 1); }
  function chooseColor(color: "white" | "black") {
    setPlayerColor(color);
    setPosition({ fen: "", moves: [] });
    setGame((value) => value + 1);
  }
  const whiteName = playerColor === "white" ? playerName : opponentName;
  const blackName = playerColor === "black" ? playerName : opponentName;
  const nextColor = position.moves.length % 2 === 0 ? "white" : "black";
  const waitingForOpponent = nextColor !== playerColor;
  const profileUrl = chessComProfile(chessComAccount);
  return <section className="opponent-explorer"><div className="concept-heading"><p className="eyebrow">PRACTICE MATCH</p><h2>選擇對手等級與顏色</h2><p>你可以執白或執黑；對手會依選擇的強度自動回棋，也能隨時撤回上一回合。</p></div>
    <div className="match-mode-selector" aria-label="建立對局">
      <button className={matchMode === "normal" ? "active" : ""} aria-pressed={matchMode === "normal"} onClick={() => { setMatchMode("normal"); setBlindStockfish(false); setGame((value) => value + 1); }}><span aria-hidden="true">♟</span><div><small>建立對局</small><b>一般對局</b><p>完整棋盤，原本的對手練習功能。</p></div></button>
      <button className={matchMode === "blind" ? "active blind" : ""} aria-pressed={matchMode === "blind"} onClick={() => { setMatchMode("blind"); setBlindStockfish(false); setGame((value) => value + 1); }}><span aria-hidden="true">◌</span><div><small>建立對局</small><b>盲棋對局</b><p>棋子隱藏，只保留對手最後一步的橘色框。</p></div><i>Live Board<br />預設折疊</i></button>
    </div>
    <div className="practice-identity"><label><span>我的名字</span><input value={playerName} onChange={(event) => setPlayerName(event.target.value)} /></label><label><span>對手名字</span><input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} /></label><label className="chesscom-account"><span>Chess.com 帳號連結</span><div><input value={chessComAccount} onChange={(event) => setChessComAccount(event.target.value)} placeholder="使用者名稱或個人頁網址" />{profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" aria-label="開啟 Chess.com 個人頁">開啟 ↗</a>}</div></label><fieldset><legend>我執哪一方</legend><button className={playerColor === "white" ? "active" : ""} aria-pressed={playerColor === "white"} onClick={() => chooseColor("white")}>♙ 白方</button><button className={playerColor === "black" ? "active" : ""} aria-pressed={playerColor === "black"} onClick={() => chooseColor("black")}>♟ 黑方</button></fieldset></div>
    <div className="opponent-layout"><div className="opponent-levels">{opponentLevels.map((item) => <button className={level === item.value ? "active" : ""} aria-pressed={level === item.value} key={item.value} onClick={() => chooseLevel(item)}><span>{item.value}</span><div><b>{item.name} · {item.opponent}</b><small>{item.rating}</small><p>{item.text}</p></div></button>)}{matchMode === "normal" ? <OpeningRecognition data={data} position={position} /> : <section className="blind-guide-locked"><span aria-hidden="true">◌</span><div><p className="eyebrow">BLIND MODE</p><h3>開局辨識已隱藏</h3><p>盲棋對局不顯示 SAN 棋譜或開局名稱；只保留對手最後一手的兩個橘色框。需要核對時，可使用「盤點位置」或展開 Live Board。</p></div></section>}</div>
      <div className="opponent-board-column"><div className={`opponent-board ${matchMode === "blind" ? "blind-game" : ""}`}><header><div><small>{matchMode === "blind" ? "盲棋對手" : "目前對手"}</small><h3>{opponentName}</h3></div><span>你執{playerColor === "white" ? "白" : "黑"}</span></header><p className={`turn-status ${waitingForOpponent ? "waiting" : "your-turn"}`}>{waitingForOpponent ? `${nextColor === "white" ? "白方" : "黑方"}正在走棋…` : `輪到你（${playerColor === "white" ? "白方" : "黑方"}）`}</p>{matchMode === "blind" && <div className="blind-intro"><span>棋子已隱藏；可用「盤點位置」確認記憶。</span><button aria-pressed={blindStockfish} onClick={() => setBlindStockfish((value) => !value)}>{blindStockfish ? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"}</button></div>}<Chessboard key={`${matchMode}-${level}-${playerColor}-${game}`} line="" interactive analysis={matchMode === "normal" || blindStockfish} deferAnalysis={matchMode === "normal" && level === 1} opponentLevel={level} playerColor={playerColor} orientation={playerColor} blind={matchMode === "blind"} onPositionChange={setPosition} />{matchMode === "blind" && position.fen && <details className="blind-live-board"><summary><span>LIVE BOARD</span><b>查看棋子位置</b><i>預設折疊</i></summary><div><Chessboard key={`live-${position.fen}`} line="" initialFen={position.fen} compact orientation={playerColor} /></div></details>}<div className="player-seats"><span className="white"><i>♔</i><small>白方</small><b>{whiteName}</b></span><span className="black"><i>♚</i><small>黑方</small><b>{blackName}</b></span></div></div></div></div>
  </section>;
}
