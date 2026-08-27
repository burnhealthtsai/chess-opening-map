import { Chess } from "chess.js";
import { createElement, useMemo, useState } from "react";
import type { Opening, OpeningMapData } from "./types";
import "./AnalogyExplorer.css";

const analogyRelationLabels = {
  reversed: "反色對應",
  structure: "結構相似",
  plan: "計畫相似",
} as const;

export default function AnalogyExplorer({ data, onSelect }: { data: OpeningMapData; onSelect: (id: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(data.analogyGroups[0]?.id ?? null);
  const group = data.analogyGroups.find((item) => item.id === activeGroup) ?? data.analogyGroups[0];
  if (!group) return <Empty />;
  const blackOpenings = group.blackIds.map((id) => data.nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node));
  const whiteOpenings = group.whiteIds.map((id) => data.nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node));
  const openingCard = (opening: Opening) => <button className="analogy-opening-card" key={opening.id} onClick={() => onSelect(opening.id)}>
    <span>{opening.eco}</span><b>{opening.title_zh}</b><small>{opening.title_en}</small><OpeningPositionPreview opening={opening} /><em>開啟主頁 →</em>
  </button>;
  return <div className="analogy-explorer">
    <div className="directory-heading with-summary"><div><p className="eyebrow">OPENING ANALOGY LAB</p><h2>黑方防禦 × 白方進攻類似比較</h2><p>把可以共用兵形判斷、出子配置或進攻計畫的開局放在一起。這裡比較的是「可移植的思考方式」，不是精確轉置，也不代表招法能逐手照搬。</p></div><aside className="map-summary"><span><b>{data.analogyGroups.length}</b><small>比較群組</small></span><i /><span><b>{data.analogyGroups.reduce((sum, item) => sum + item.blackIds.length + item.whiteIds.length, 0)}</b><small>開局對照</small></span></aside></div>
    <div className="analogy-layout">
      <nav className="analogy-group-list" aria-label="黑白開局類似比較群組">{data.analogyGroups.map((item) => <button className={item.id === group.id ? "active" : ""} key={item.id} onClick={() => setActiveGroup(item.id)}><span>{analogyRelationLabels[item.relation]}</span><b>{item.title}</b><small>{item.blackIds.length} 個黑方・{item.whiteIds.length} 個白方</small></button>)}</nav>
      <section className="analogy-detail" aria-live="polite">
        <header><span className={`analogy-badge ${group.relation}`}>≈ {analogyRelationLabels[group.relation]}・非精確轉置</span><h3>{group.title}</h3><p>{group.summary}</p></header>
        <div className="analogy-ideas"><h4>可以互相借用的觀念</h4><div>{group.sharedIdeas.map((idea) => <span key={idea}>{idea}</span>)}</div></div>
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

function OpeningPositionPreview({ opening }: { opening: Opening }) {
  const position = useMemo(() => {
    const game = new Chess();
    for (const san of lineMoves(opening.mainline)) {
      try { game.move(san); } catch { break; }
    }
    const squares = game.board().flatMap((row) => row);
    return opening.side === "黑方" ? squares.reverse() : squares;
  }, [opening]);
  const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;
  return <span className="opening-position-preview" aria-label={`${opening.title_zh}主線走完後局面`}><span className="preview-board cg-wrap" aria-hidden="true">{position.map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? "dark" : "light"} key={index}>{piece && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}` })}</span>)}</span><i>主線走完後</i></span>;
}

function lineMoves(line: string) { return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)); }
function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
