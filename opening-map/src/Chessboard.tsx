import { Chess, type PieceSymbol, type Square } from "chess.js";
import { createElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { useStockfish } from "./useStockfish";

const pieceNames: Record<PieceSymbol, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const initialGame = new Chess();
const initialPieces = new Map(initialGame.board().flatMap((row, rowIndex) => row.map((piece, colIndex) => [`${files[colIndex]}${8 - rowIndex}`, piece] as const)));

function movesFromLine(line: string) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

let audioContext: AudioContext | null = null;
let woodNoise: AudioBuffer | null = null;
type ChessSound = "move" | "capture" | "opening" | "check" | "checkmate";

export function prepareChessSound() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  woodNoise ??= createWoodNoise(audioContext);
}

function playChessSound(kind: ChessSound) {
  prepareChessSound();
  if (!audioContext || !woodNoise) return;
  const now = audioContext.currentTime;
  if (kind === "capture") {
    playWoodImpact(audioContext, woodNoise, now, 520, 168, .92);
    playWoodImpact(audioContext, woodNoise, now + .062, 390, 126, .78);
  } else if (kind === "opening") {
    playWoodImpact(audioContext, woodNoise, now, 470, 148, .78);
    playTone(audioContext, now + .055, 392, .1, .035);
  } else if (kind === "checkmate") {
    playWoodImpact(audioContext, woodNoise, now, 430, 122, .95);
    playTone(audioContext, now + .04, 392, .14, .045);
    playTone(audioContext, now + .16, 523.25, .28, .052);
  } else if (kind === "check") {
    playWoodImpact(audioContext, woodNoise, now, 510, 154, .8);
    playTone(audioContext, now + .035, 466.16, .12, .03);
  } else {
    playWoodImpact(audioContext, woodNoise, now, 455, 142, .74);
  }
}

function createWoodNoise(context: AudioContext) {
  const duration = .13;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    const envelope = Math.exp(-index / (context.sampleRate * .018));
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }
  return buffer;
}

function playWoodImpact(context: AudioContext, noiseBuffer: AudioBuffer, at: number, clickFrequency: number, bodyFrequency: number, strength: number) {
  const noise = context.createBufferSource();
  const click = context.createBiquadFilter();
  const body = context.createBiquadFilter();
  const clickGain = context.createGain();
  const bodyGain = context.createGain();
  const master = context.createGain();

  noise.buffer = noiseBuffer;
  noise.playbackRate.setValueAtTime(.97 + Math.random() * .06, at);
  click.type = "bandpass";
  click.frequency.setValueAtTime(clickFrequency, at);
  click.Q.setValueAtTime(.65, at);
  body.type = "bandpass";
  body.frequency.setValueAtTime(bodyFrequency, at);
  body.Q.setValueAtTime(.9, at);
  clickGain.gain.setValueAtTime(.0001, at);
  clickGain.gain.exponentialRampToValueAtTime(.065 * strength, at + .002);
  clickGain.gain.exponentialRampToValueAtTime(.0001, at + .07);
  bodyGain.gain.setValueAtTime(.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(.08 * strength, at + .003);
  bodyGain.gain.exponentialRampToValueAtTime(.0001, at + .11);
  master.gain.setValueAtTime(.62, at);
  noise.connect(click).connect(clickGain).connect(master);
  noise.connect(body).connect(bodyGain).connect(master);
  master.connect(context.destination);

  noise.start(at);
  noise.stop(at + .125);
}

function playTone(context: AudioContext, at: number, frequency: number, duration: number, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + .02);
}

function moveSound(game: Chess, captured: boolean, opening = false): ChessSound {
  if (game.isCheckmate()) return "checkmate";
  if (game.isCheck()) return "check";
  if (opening) return "opening";
  return captured ? "capture" : "move";
}

type ChessboardProps = {
  line: string;
  initialFen?: string;
  initialStep?: number;
  interactive?: boolean;
  analysis?: boolean;
  deferAnalysis?: boolean;
  compact?: boolean;
  showControls?: boolean;
  autoPlay?: boolean;
  autoPlayFromStep?: number;
  orientation?: "white" | "black";
  onBestMove?: (san: string | null, fen: string, analysis: { status: ReturnType<typeof useStockfish>["status"]; depth: number }) => void;
  onPositionChange?: (position: { fen: string; moves: string[] }) => void;
  opponentLevel?: 1 | 2 | 3;
  playerColor?: "white" | "black";
  onManualMove?: (move: { san: string; from: Square; to: Square; fen: string }) => void;
  onManualUndo?: () => void;
  blind?: boolean;
};

type PromotionPiece = "q" | "r" | "b" | "n";
type BoardArrow = { from: Square; to: Square; kind: "attack" | "counter" };

function squareCenter(square: Square, orientation: "white" | "black") {
  const file = files.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === "white"
    ? { x: file + .5, y: 8 - rank + .5 }
    : { x: 7 - file + .5, y: rank - .5 };
}

export function Chessboard({ line, initialFen, initialStep = 0, interactive = false, analysis = false, deferAnalysis = false, compact = false, showControls, autoPlay = false, autoPlayFromStep = 0, orientation = "white", onBestMove, onPositionChange, opponentLevel, playerColor = "white", onManualMove, onManualUndo, blind = false }: ChessboardProps) {
  const moves = useMemo(() => movesFromLine(line), [line]);
  const [step, setStep] = useState(() => autoPlay ? Math.min(autoPlayFromStep, moves.length) : Math.min(initialStep, moves.length));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualFen, setManualFen] = useState<string | null>(null);
  const [manualMoves, setManualMoves] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [playbackInterrupted, setPlaybackInterrupted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; color: "w" | "b" } | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [blindInventory, setBlindInventory] = useState(false);
  const [blindNote, setBlindNote] = useState("按「盤點位置」後，點選格子確認你記憶中的棋子位置。");
  const [lastOpponentMove, setLastOpponentMove] = useState<{ from: Square; to: Square } | null>(null);
  const [analysisRequested, setAnalysisRequested] = useState(() => !deferAnalysis);
  const arrowStart = useRef<Square | null>(null);
  const markerId = useId().replace(/:/g, "");
  const controlsVisible = showControls ?? !compact;
  const safeStep = Math.min(step, moves.length);
  const playback = useMemo(() => {
    const game = new Chess(initialFen);
    let lastTo: Square | null = null;
    for (const san of moves.slice(0, safeStep)) {
      try { lastTo = game.move(san).to as Square; } catch { break; }
    }
    return { fen: game.fen(), lastTo };
  }, [initialFen, moves, safeStep]);
  const playbackFen = playback.fen;
  const displayFen = manualFen ?? playbackFen;
  const positionMoves = useMemo(() => manualFen ? manualMoves : moves.slice(0, safeStep), [manualFen, manualMoves, moves, safeStep]);
  const initialTurnPly = useMemo(() => new Chess(initialFen).turn() === "w" ? 0 : 1, [initialFen]);
  useEffect(() => { onPositionChange?.({ fen: displayFen, moves: positionMoves }); }, [displayFen, onPositionChange, positionMoves]);
  const displayGame = useMemo(() => new Chess(displayFen), [displayFen]);
  const board = displayGame.board();
  const displayedSquares = board.flatMap((row, rowIndex) => row.map((piece, colIndex) => ({
    piece,
    square: `${files[colIndex]}${8 - rowIndex}` as Square,
    dark: (rowIndex + colIndex) % 2 === 1,
  })));
  if (orientation === "black") displayedSquares.reverse();
  const engineEnabled = Boolean(opponentLevel) || ((analysis || Boolean(onBestMove)) && analysisRequested);
  const engine = useStockfish(displayFen, engineEnabled);
  const suggestedFrom = analysis && engine.bestMove ? engine.bestMove.slice(0, 2) as Square : null;
  const suggestedTo = analysis && engine.bestMove ? engine.bestMove.slice(2, 4) as Square : null;
  useEffect(() => {
    if (!onBestMove) return;
    const analysisState = { status: engine.status, depth: engine.depth };
    if (!engine.bestMove) {
      onBestMove(null, displayFen, analysisState);
      return;
    }
    try {
      const game = new Chess(displayFen);
      const move = game.move({
        from: engine.bestMove.slice(0, 2) as Square,
        to: engine.bestMove.slice(2, 4) as Square,
        promotion: (engine.bestMove[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      onBestMove(move.san.replace(/[+#]+$/, ""), displayFen, analysisState);
    } catch {
      onBestMove(null, displayFen, analysisState);
    }
  }, [displayFen, engine.bestMove, engine.depth, engine.status, onBestMove]);
  const legalTargets = useMemo(() => new Set(selectedSquare
    ? displayGame.moves({ square: selectedSquare, verbose: true }).map((move) => move.to)
    : []), [displayGame, selectedSquare]);
  const fileLabels = orientation === "white" ? files : [...files].reverse();
  const rankLabels = orientation === "white" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];

  useEffect(() => {
    if (!opponentLevel) return;
    const currentFen = manualFen ?? playbackFen;
    const game = new Chess(currentFen);
    const userTurn = playerColor === "white" ? "w" : "b";
    if (game.turn() === userTurn || game.isGameOver()) return;
    const legalNow = game.moves({ verbose: true });
    const currentEngineMove = engine.bestMove && legalNow.find((move) => `${move.from}${move.to}${move.promotion ?? ""}` === engine.bestMove);
    if (opponentLevel > 1 && !currentEngineMove) return;
    const timer = window.setTimeout(() => {
      const reply = new Chess(currentFen);
      const legal = reply.moves({ verbose: true });
      if (!legal.length) return;
      const engineMove = engine.bestMove && legal.find((move) => `${move.from}${move.to}${move.promotion ?? ""}` === engine.bestMove);
      const useEngine = opponentLevel === 3 || (opponentLevel === 2 && Math.random() < .72);
      const choice = useEngine && engineMove ? engineMove : legal[Math.floor(Math.random() * legal.length)];
      const result = reply.move(choice);
      if (soundEnabled) playChessSound(moveSound(reply, Boolean(result.captured), !initialFen && manualMoves.length === 0));
      setManualFen(reply.fen());
      setManualMoves((current) => [...current, result.san]);
      if (blind) setLastOpponentMove({ from: result.from as Square, to: result.to as Square });
      setSelectedSquare(null);
    }, opponentLevel === 1 ? 520 : 760);
    return () => window.clearTimeout(timer);
  }, [engine.bestMove, initialFen, manualFen, manualMoves.length, opponentLevel, playbackFen, playerColor, soundEnabled]);

  function goTo(nextStep: number) {
    if (manualFen) return;
    setPlaybackInterrupted(true);
    const target = Math.max(0, Math.min(moves.length, nextStep));
    if (target === safeStep) return;
    let sound: ChessSound = "move";
    if (target > safeStep) {
      const game = new Chess(initialFen);
      for (let index = 0; index < target; index += 1) {
        try {
          const result = game.move(moves[index]);
          if (index >= safeStep) sound = moveSound(game, Boolean(result.captured), !initialFen && index === 0);
        } catch { break; }
      }
    }
    if (soundEnabled) playChessSound(sound);
    setStep(target);
  }

  useEffect(() => {
    if (!autoPlay || playbackInterrupted || paused) return;
    const target = Math.min(initialStep, moves.length);
    const start = Math.min(autoPlayFromStep, target);
    if (target <= start) return;
    let next = Math.max(start, safeStep) + 1;
    if (next > target) return;
    let timer = window.setTimeout(function advance() {
      const game = new Chess(initialFen);
      let sound: ChessSound = "move";
      for (let index = 0; index < next; index += 1) {
        try {
          const result = game.move(moves[index]);
          if (index === next - 1) sound = moveSound(game, Boolean(result.captured), !initialFen && index === 0);
        } catch { return; }
      }
      if (soundEnabled) playChessSound(sound);
      setStep(next);
      next += 1;
      if (next <= target) timer = window.setTimeout(advance, 680);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [autoPlay, autoPlayFromStep, initialFen, initialStep, moves, paused, playbackInterrupted, soundEnabled]);

  function manualPosition(nextMoves: string[]) {
    const game = new Chess(playbackFen);
    for (const san of nextMoves) {
      try { game.move(san); } catch { break; }
    }
    return game.fen();
  }

  function undoManual() {
    if (!manualFen || !manualMoves.length) return;
    const game = new Chess(manualFen);
    const userTurn = playerColor === "white" ? "w" : "b";
    const plies = opponentLevel && game.turn() === userTurn && manualMoves.length > 1 ? 2 : 1;
    const nextMoves = manualMoves.slice(0, Math.max(0, manualMoves.length - plies));
    setManualMoves(nextMoves);
    setManualFen(manualPosition(nextMoves));
    setSelectedSquare(null);
    setPendingPromotion(null);
    onManualUndo?.();
  }

  function resetManual() {
    setManualMoves([]);
    setManualFen(playbackFen);
    setSelectedSquare(null);
    setPendingPromotion(null);
    onManualUndo?.();
  }

  function toggleManual() {
    if (manualFen) {
      setManualFen(null);
      setManualMoves([]);
    } else {
      setManualFen(playbackFen);
    }
    setSelectedSquare(null);
    setPendingPromotion(null);
  }

  function commitManualMove(game: Chess, from: Square, to: Square, promotion?: PromotionPiece) {
    const move = game.move({ from, to, promotion });
    if (!move) return;
    if (soundEnabled) playChessSound(moveSound(game, Boolean(move.captured), !initialFen && !manualMoves.length && safeStep === 0));
    setManualFen(game.fen());
    setManualMoves((current) => [...current, move.san]);
    setSelectedSquare(null);
    setPendingPromotion(null);
    onManualMove?.({ san: move.san, from: move.from as Square, to: move.to as Square, fen: game.fen() });
  }

  function movePiece(square: Square, draggedFrom?: Square) {
    if (!interactive) return;
    if (arrows.length) setArrows([]);
    if (blind && blindInventory) {
      const piece = displayGame.get(square);
      setBlindNote(piece ? `${square}：${piece.color === "w" ? "白方" : "黑方"}${pieceNames[piece.type]}` : `${square}：空格`);
      return;
    }
    const userTurn = playerColor === "white" ? "w" : "b";
    if (opponentLevel && displayGame.turn() !== userTurn) return;
    setPlaybackInterrupted(true);
    const game = new Chess(manualFen ?? playbackFen);
    const from = draggedFrom ?? selectedSquare;
    const piece = game.get(square);
    if (!from) {
      if (piece?.color === game.turn()) setSelectedSquare(square);
      return;
    }
    if (!draggedFrom && piece?.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }
    try {
      const candidates = game.moves({ square: from, verbose: true }).filter((move) => move.to === square);
      if (candidates.some((move) => Boolean(move.promotion))) {
        setPendingPromotion({ from, to: square, color: game.turn() });
        return;
      }
      commitManualMove(game, from, square);
    } catch {
      setSelectedSquare(null);
    }
  }

  function addArrow(to: Square, counter: boolean) {
    const from = arrowStart.current;
    arrowStart.current = null;
    if (!from || from === to) return;
    const kind: BoardArrow["kind"] = counter ? "counter" : "attack";
    setArrows((current) => {
      const exists = current.some((arrow) => arrow.from === from && arrow.to === to && arrow.kind === kind);
      return exists
        ? current.filter((arrow) => !(arrow.from === from && arrow.to === to && arrow.kind === kind))
        : [...current, { from, to, kind }];
    });
  }

  function setPieceDragImage(event: React.DragEvent<HTMLButtonElement>, piece: { type: PieceSymbol; color: "w" | "b" }) {
    const ghost = document.createElement("div");
    ghost.className = "piece-drag-ghost cg-wrap";
    const icon = document.createElement("piece");
    icon.className = `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}`;
    ghost.append(icon);
    document.body.append(ghost);
    event.dataTransfer.setDragImage(ghost, 34, 34);
    window.setTimeout(() => ghost.remove(), 0);
  }

  return <section className={`board-section ${compact ? "compact" : ""}`} aria-label="開局棋盤">
    <div className="board-frame">
      <div className="rank-coordinates" aria-hidden="true">{rankLabels.map((rank) => <span key={rank}>{rank}</span>)}</div>
      <div className={`board cg-wrap ${manualFen ? "manual" : ""} ${autoPlay ? "autoplay" : ""}`} role="grid" aria-label={manualFen ? "自由走棋棋盤" : `主線第 ${safeStep} 手後的棋盤`}>
        <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            <marker id={`attack-${markerId}`} markerWidth=".58" markerHeight=".58" refX=".49" refY=".29" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 .58 .58"><path d="M0 0 L.58 .29 L0 .58 Z" /></marker>
            <marker id={`counter-${markerId}`} markerWidth=".58" markerHeight=".58" refX=".49" refY=".29" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 .58 .58"><path d="M0 0 L.58 .29 L0 .58 Z" /></marker>
          </defs>
          {arrows.map((arrow, index) => {
            const from = squareCenter(arrow.from, orientation);
            const to = squareCenter(arrow.to, orientation);
            return <line key={`${arrow.from}-${arrow.to}-${arrow.kind}-${index}`} className={arrow.kind} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={`url(#${arrow.kind}-${markerId})`} />;
          })}
        </svg>
        {displayedSquares.map(({ piece, square, dark }) => {
          const selected = selectedSquare === square;
          const target = legalTargets.has(square);
          const initialPiece = initialPieces.get(square);
          const changed = Boolean(piece && (!initialPiece || initialPiece.type !== piece.type || initialPiece.color !== piece.color));
          const userTurn = playerColor === "white" ? "w" : "b";
          const canDrag = Boolean(interactive && (!opponentLevel || displayGame.turn() === userTurn) && piece && piece.color === displayGame.turn());
          const suggested = suggestedFrom === square ? "engine-suggest-from" : suggestedTo === square ? "engine-suggest-to" : "";
          const blindLastMove = blind && lastOpponentMove && (lastOpponentMove.from === square || lastOpponentMove.to === square) ? "blind-last-move" : "";
          return <button type="button" className={`square ${dark ? "dark" : "light"} ${selected ? "selected-square" : ""} ${target ? "legal-target" : ""} ${changed ? "changed-piece" : ""} ${suggested} ${blindLastMove} ${autoPlay && playback.lastTo === square ? "arrived" : ""}`}
            key={square} onClick={() => movePiece(square)} disabled={!interactive} draggable={canDrag}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => { if (event.button === 2) { event.preventDefault(); arrowStart.current = square; } }}
            onPointerUp={(event) => { if (event.button === 2) { event.preventDefault(); addArrow(square, event.shiftKey); } }}
            onDragStart={(event) => { if (!canDrag || !piece) return; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", square); setPieceDragImage(event, piece); setSelectedSquare(square); }}
            onDragOver={(event) => { if (interactive) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData("text/plain") as Square; if (from) movePiece(square, from); }}
            aria-label={`${square}${piece ? ` ${piece.color === "w" ? "白" : "黑"}${piece.type}` : " 空格"}`}>
            {piece && !blind && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}`, "aria-hidden": true })}
          </button>;
        })}
      </div>
      <div className="file-coordinates" aria-hidden="true">{fileLabels.map((file) => <span key={file}>{file}</span>)}</div>
    </div>
    {pendingPromotion && <div className="promotion-picker" role="dialog" aria-label="選擇兵升變棋子">
      <b>選擇升變棋子</b><div>{(["q", "r", "b", "n"] as PromotionPiece[]).map((kind) => <button type="button" className="promotion-piece-button cg-wrap" key={kind} onClick={() => {
        const game = new Chess(manualFen ?? playbackFen);
        commitManualMove(game, pendingPromotion.from, pendingPromotion.to, kind);
      }} aria-label={`升變為${kind === "q" ? "后" : kind === "r" ? "車" : kind === "b" ? "象" : "馬"}`}>{createElement("piece", { className: `promotion-piece ${pieceNames[kind]} ${pendingPromotion.color === "w" ? "white" : "black"}` })}</button>)}</div>
      <button type="button" className="promotion-cancel" onClick={() => { setPendingPromotion(null); setSelectedSquare(null); }}>取消</button>
    </div>}
    {controlsVisible && <div className="board-controls">
      <button onClick={manualFen ? resetManual : () => goTo(0)} disabled={manualFen ? manualMoves.length === 0 : safeStep === 0} aria-label="回到起始局面">↺</button>
      <button onClick={manualFen ? undoManual : () => goTo(safeStep - 1)} disabled={manualFen ? manualMoves.length === 0 : safeStep === 0} aria-label="上一步">←</button>
      <span><strong>{manualFen ? manualMoves.length : safeStep}</strong> / {manualFen ? "自由" : moves.length}</span>
      <button onClick={() => goTo(safeStep + 1)} disabled={safeStep === moves.length || Boolean(manualFen)} aria-label="下一步">→</button>
      <button onClick={() => goTo(moves.length)} disabled={safeStep === moves.length || Boolean(manualFen)} aria-label="跳到最後一步">⇥</button>
      <button className={`sound-toggle ${soundEnabled ? "on" : ""}`} onClick={() => setSoundEnabled((value) => !value)} aria-label={soundEnabled ? "關閉走棋音效" : "開啟走棋音效"}>{soundEnabled ? "🔊" : "🔇"}</button>
      {arrows.length > 0 && <button className="clear-arrows" onClick={() => setArrows([])} aria-label="清除攻防箭頭">↗×</button>}
      {autoPlay && <button className="pause-toggle" onClick={() => setPaused((value) => !value)} disabled={safeStep >= moves.length} aria-label={paused ? "繼續播放" : "暫停播放"}>{paused ? "▶" : "⏸"}</button>}
      {interactive && !opponentLevel && <button className={`manual-toggle ${manualFen ? "on" : ""}`} onClick={toggleManual}>{manualFen ? "回到棋譜" : "自由走棋"}</button>}
      {blind && <button className={`manual-toggle ${blindInventory ? "on" : ""}`} onClick={() => setBlindInventory((value) => !value)}>{blindInventory ? "結束盤點" : "盤點位置"}</button>}
    </div>}
    {controlsVisible && (manualFen ? manualMoves.length > 0 : safeStep > 0) && <div className="move-line" aria-live="polite">{manualFen
      ? <><b className="manual-label">自由走棋</b><MoveTokens moves={manualMoves} startPly={initialTurnPly + safeStep} /></>
      : <MoveTokens moves={moves.slice(0, safeStep)} startPly={initialTurnPly} />}</div>}
    {interactive && <p className="arrow-help">右鍵拖曳：攻擊箭頭 · Shift＋右鍵拖曳：對手反擊</p>}
    {blind && <p className="blind-note">盲棋模式：只標示對手最後一步的起點與終點。{blindNote}</p>}
    {analysis && <StockfishPanel analysis={engine} fen={displayFen} enabled={engineEnabled} initiallyCollapsed={deferAnalysis} onExpand={() => setAnalysisRequested(true)} />}
  </section>;
}

function MoveTokens({ moves, startPly = 0 }: { moves: string[]; startPly?: number }) {
  return <>{moves.map((move, index) => {
    const white = (startPly + index) % 2 === 0;
    return <span className={`move-token ${white ? "white-move" : "black-move"}`} key={`${move}-${index}`}><i aria-hidden="true">{movePieceGlyph(move, white)}</i><b>{move}</b></span>;
  })}</>;
}

function movePieceGlyph(san: string, white: boolean) {
  const key = san.replace(/^[+#]*/, "")[0];
  const type = key === "N" ? "n" : key === "B" ? "b" : key === "R" ? "r" : key === "Q" ? "q" : key === "K" || san.startsWith("O-O") ? "k" : "p";
  const glyphs = white ? { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" } : { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
  return glyphs[type];
}

function engineMoveReasons(piece: { type: PieceSymbol; color: "w" | "b" }, from: Square, to: Square, san: string, captured: boolean, givesCheck: boolean) {
  const reasons: string[] = [];
  if (/O-O/.test(san)) reasons.push("完成王的安全，同時讓角落的車開始參與中央或開放線。");
  if (captured) reasons.push("立即取得或交換重要子力，並移除對手在這個格子的防守／壓力。");
  if (givesCheck || /[+#]$/.test(san)) reasons.push("帶將軍迫使對手先回應，因而保留行棋主動權。");
  if (["d4", "d5", "e4", "e5"].includes(to)) reasons.push(`把${piece.type === "p" ? "兵" : "棋子"}放到 ${to}，直接爭奪中心空間與關鍵格。`);
  if (piece.type === "n" && ["b1", "g1", "b8", "g8"].includes(from)) reasons.push("發展尚未出動的馬，增加中心控制並為易位清路。");
  if (piece.type === "b" && ["c1", "f1", "c8", "f8"].includes(from)) reasons.push("發展主教並打開斜線，讓後排子力更容易協同。");
  if (piece.type === "r") reasons.push("把車放到較活躍的直線，準備侵入或支援通路兵。");
  if (piece.type === "k" && !/O-O/.test(san)) reasons.push("改善王的位置；殘局中通常是接近中心或保護關鍵兵。");
  if (!reasons.length) reasons.push(`改善這枚棋子在 ${to} 的活動度，同時降低對手下一手的有效選擇。`);
  return reasons.slice(0, 2);
}

function StockfishPanel({ analysis, fen, enabled, initiallyCollapsed = false, onExpand }: { analysis: ReturnType<typeof useStockfish>; fen: string; enabled: boolean; initiallyCollapsed?: boolean; onExpand?: () => void }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const label = !enabled ? "展開後載入分析引擎" : analysis.status === "loading" ? "載入分析引擎…" : analysis.status === "error" ? "分析引擎無法載入" : analysis.status === "thinking" ? "分析中…" : "分析完成";
  const evaluation = analysis.mate !== null ? `M${analysis.mate}` : analysis.score !== null ? `${analysis.score >= 0 ? "+" : ""}${analysis.score.toFixed(2)}` : "—";
  const whiteShare = analysis.mate !== null ? (analysis.mate > 0 ? 92 : 8) : analysis.score !== null ? Math.max(8, Math.min(92, 50 + analysis.score * 8)) : 50;
  const suggestion = useMemo(() => {
    if (!analysis.bestMove) return null;
    try {
      const game = new Chess(fen);
      const from = analysis.bestMove.slice(0, 2) as Square;
      const piece = game.get(from);
      if (!piece) return null;
      const move = game.move({ from, to: analysis.bestMove.slice(2, 4) as Square, promotion: (analysis.bestMove[4] as "q" | "r" | "b" | "n" | undefined) ?? "q" });
      const names: Record<PieceSymbol, string> = { k: "王", q: "后", r: "車", b: "象", n: "馬", p: "兵" };
      return { san: move.san, color: piece.color === "w" ? "white" : "black", colorName: piece.color === "w" ? "白" : "黑", pieceName: names[piece.type], kind: pieceNames[piece.type], reasons: engineMoveReasons(piece, from, move.to as Square, move.san, Boolean(move.captured), game.isCheck()) } as const;
    } catch { return null; }
  }, [analysis.bestMove, fen]);
  return <aside className={`stockfish-panel ${collapsed ? "collapsed" : ""}`} aria-live="polite">
    <div className="engine-heading"><div><b>Stockfish 18</b><small>{label} {analysis.depth ? `· 深度 ${analysis.depth}` : ""}</small></div><div className="engine-heading-actions"><strong>{evaluation}</strong><button type="button" onClick={() => setCollapsed((value) => { const next = !value; if (!next) onExpand?.(); return next; })} aria-expanded={!collapsed} aria-label={collapsed ? "展開 Stockfish 分析" : "摺疊 Stockfish 分析"}>{collapsed ? "＋" : "−"}</button></div></div>
    {!collapsed && <><div className="eval-bar" aria-label={`白方局面比例 ${Math.round(whiteShare)}%`}><span style={{ width: `${whiteShare}%` }} /></div>
      <p className={`engine-suggestion ${suggestion?.color ?? ""}`}>{suggestion ? <><span className="engine-piece-icon cg-wrap" aria-hidden="true">{createElement("piece", { className: `${suggestion.kind} ${suggestion.color}` })}</span><span>建議下法：<b>{suggestion.colorName}{suggestion.pieceName} {suggestion.san}</b></span></> : "正在計算建議下法"}</p>
      {suggestion && <div className="engine-why"><b>為什麼這樣下？</b><ul>{suggestion.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
      <small>分析在瀏覽器本機執行。<a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js</a> · <a href={`${import.meta.env.BASE_URL}stockfish/Copying.txt`} target="_blank" rel="noreferrer">GPL-3.0</a></small></>}
  </aside>;
}
