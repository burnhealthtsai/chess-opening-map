import { Chess } from "chess.js";
import { createElement, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AnalogyGroup, Opening } from "./types";
import "./AnalogyExplorer.css";

const analogyRelationLabels = {
  reversed: "反色對應",
  structure: "結構相似",
  plan: "計畫相似",
} as const;

export default function AnalogyExplorer({ nodes, groups, onSelect }: { nodes: Opening[]; groups: AnalogyGroup[]; onSelect: (id: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? null);
  const groupListRef = useRef<HTMLElement>(null);
  const group = groups.find((item) => item.id === activeGroup) ?? groups[0];
  if (!group) return <Empty />;
  function moveGroup(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const previous = ["ArrowUp", "ArrowLeft", "w", "a"].includes(key);
    const next = ["ArrowDown", "ArrowRight", "s", "d"].includes(key);
    if (!previous && !next && key !== "Home" && key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    const target = key === "Home" ? 0 : key === "End" ? groups.length - 1 : (index + (previous ? -1 : 1) + groups.length) % groups.length;
    setActiveGroup(groups[target].id);
    requestAnimationFrame(() => groupListRef.current?.querySelectorAll<HTMLButtonElement>("button")[target]?.focus());
  }
  const blackOpenings = group.blackIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node));
  const whiteOpenings = group.whiteIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node));
  const openingCard = (opening: Opening) => <button type="button" className="analogy-opening-card" key={opening.id} onClick={() => onSelect(opening.id)}>
    <span>{opening.eco}</span><b>{opening.title_zh}</b><small>{opening.title_en}</small><OpeningPositionPreview opening={opening} /><em>開啟主頁 →</em>
  </button>;
  const exampleCard = (side: "black" | "white") => {
    const example = group.examples[side];
    const opening = nodes.find((node) => node.id === example.openingId);
    if (!opening) return null;
    return <FormationExample side={side} example={example} opening={opening} key={`${group.id}-${side}`} />;
  };
  return <div className="analogy-explorer">
    <div className="directory-heading with-summary"><div><p className="eyebrow">OPENING ANALOGY LAB</p><h2>黑方防禦 × 白方進攻類似比較</h2><p>把可以共用兵形判斷、出子配置或進攻計畫的開局放在一起。這裡比較的是「可移植的思考方式」，不是精確轉置，也不代表招法能逐手照搬。</p></div><aside className="map-summary"><span><b>{groups.length}</b><small>比較群組</small></span><i /><span><b>{groups.reduce((sum, item) => sum + item.blackIds.length + item.whiteIds.length, 0)}</b><small>開局對照</small></span></aside></div>
    <div className="analogy-layout">
      <nav ref={groupListRef} className="analogy-group-list" role="tablist" aria-label="黑白開局類似比較群組">{groups.map((item, index) => <button type="button" role="tab" id={`analogy-tab-${item.id}`} aria-controls="analogy-group-detail" aria-selected={item.id === group.id} tabIndex={item.id === group.id ? 0 : -1} className={item.id === group.id ? "active" : ""} key={item.id} onClick={() => setActiveGroup(item.id)} onKeyDown={(event) => moveGroup(event, index)}><span>{analogyRelationLabels[item.relation]}</span><b>{item.title}</b><small>{item.blackIds.length} 個黑方・{item.whiteIds.length} 個白方</small></button>)}</nav>
      <section className="analogy-detail" id="analogy-group-detail" role="tabpanel" aria-labelledby={`analogy-tab-${group.id}`} aria-live="polite">
        <header><span className={`analogy-badge ${group.relation}`}>≈ {analogyRelationLabels[group.relation]}・非精確轉置</span><h3>{group.title}</h3><p>{group.summary}</p></header>
        <div className="analogy-ideas"><h4>可以互相借用的觀念</h4><div>{group.sharedIdeas.map((idea) => <span key={idea}>{idea}</span>)}</div></div>
        <section className="analogy-examples"><h4>形成對照的示範棋路</h4><p>兩邊各走到能看出共同結構或計畫的位置；棋路合法，但終局面不是精確轉置。</p><div>{exampleCard("black")}{exampleCard("white")}</div></section>
        <div className="analogy-comparison">
          <section className="analogy-side black"><header><span>♚</span><div><small>BLACK DEFENSE</small><h4>黑方防禦</h4></div></header><div>{blackOpenings.map(openingCard)}</div></section>
          <div className="analogy-arrow" aria-hidden="true"><b>≈</b><small>觀念映射</small></div>
          <section className="analogy-side white"><header><span>♔</span><div><small>WHITE SYSTEM</small><h4>白方進攻／體系</h4></div></header><div>{whiteOpenings.map(openingCard)}</div></section>
        </div>
        <aside className="analogy-difference"><b>不能直接照抄的地方</b><p>{group.difference}</p></aside>
      </section>
    </div>
  </div>;
}

function FormationExample({ side, example, opening }: {
  side: "black" | "white";
  example: AnalogyGroup["examples"]["black"];
  opening: Opening;
}) {
  const moves = useMemo(() => lineMoves(example.line), [example.line]);
  const [step, setStep] = useState(moves.length);
  const positionLabel = step === moves.length ? `${example.label}形成局面` : step === 0 ? "起始局面" : `第 ${step} 手後`;
  function moveReplay(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setStep((current) => event.key === "Home" ? 0 : event.key === "End" ? moves.length : Math.max(0, Math.min(moves.length, current + (event.key === "ArrowLeft" ? -1 : 1))));
  }
  return <article className={side} onKeyDown={moveReplay}>
    <header><span aria-hidden="true">{side === "black" ? "♚" : "♔"}</span><div><small>{side === "black" ? "黑方形成棋路" : "白方形成棋路"}</small><b>{example.label}</b></div></header>
    <OpeningPositionPreview opening={opening} line={example.line} step={step} label={positionLabel} />
    <div className="analogy-replay-controls" aria-label={`${example.label}棋路播放控制`} aria-keyshortcuts="ArrowLeft ArrowRight Home End">
      <button type="button" aria-disabled={step === 0} aria-label="回到起始局面" title="回到起始局面（Home）" onClick={() => setStep(0)}>⏮</button>
      <button type="button" aria-disabled={step === 0} aria-label="上一手" title="上一手（←）" onClick={() => setStep((current) => Math.max(0, current - 1))}>←</button>
      <output aria-live="polite" aria-atomic="true">{step} / {moves.length} 手</output>
      <button type="button" aria-disabled={step === moves.length} aria-label="下一手" title="下一手（→）" onClick={() => setStep((current) => Math.min(moves.length, current + 1))}>→</button>
      <button type="button" aria-disabled={step === moves.length} aria-label="走到形成局面" title="走到形成局面（End）" onClick={() => setStep(moves.length)}>⏭</button>
    </div>
    <small className="analogy-replay-hint">鍵盤：← → 逐手・Home／End 跳到兩端</small>
    <ol className="analogy-move-timeline" aria-label={`${example.label}完整棋路`}>{moves.map((move, index) => <li key={`${move}-${index}`}><button type="button" className={index + 1 === step ? "current" : index < step ? "played" : ""} aria-label={`走到第 ${index + 1} 手 ${move}`} title={`走到第 ${index + 1} 手 ${move}`} aria-current={index + 1 === step ? "step" : undefined} onClick={() => setStep(index + 1)}>{moveLabel(index, move)}</button></li>)}</ol>
  </article>;
}

function OpeningPositionPreview({ opening, line = opening.mainline, step, label = "主線走完後" }: { opening: Opening; line?: string; step?: number; label?: string }) {
  const position = useMemo(() => {
    const game = new Chess();
    const moves = lineMoves(line);
    for (const san of moves.slice(0, step ?? moves.length)) {
      try { game.move(san); } catch { break; }
    }
    const squares = game.board().flatMap((row) => row);
    return opening.side === "黑方" ? squares.reverse() : squares;
  }, [line, opening.side, step]);
  const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;
  return <span className="opening-position-preview" aria-label={`${opening.title_zh}${label}局面`}><span className="preview-board cg-wrap" aria-hidden="true">{position.map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? "dark" : "light"} key={index}>{piece && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}` })}</span>)}</span><i>{label}</i></span>;
}

function lineMoves(line: string) { return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)); }
function moveLabel(index: number, move: string) { return `${Math.floor(index / 2) + 1}${index % 2 ? "…" : "."}${move}`; }
function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
