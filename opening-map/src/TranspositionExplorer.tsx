import { Chess } from "chess.js";
import { createElement, useMemo, useState } from "react";
import type { Opening, TranspositionGroup } from "./types";
import "./TranspositionExplorer.css";

export default function TranspositionExplorer({ nodes, groups, onSelect }: { nodes: Opening[]; groups: TranspositionGroup[]; onSelect: (id: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? null);
  const group = groups.find((item) => item.id === activeGroup) ?? groups[0];
  const members = group?.memberIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node)) ?? [];
  if (!group) return <Empty />;
  return <div className="transposition-explorer">
    <div className="directory-heading with-summary"><div><p className="eyebrow">TRANSPOSITION ATLAS</p><h2>體系轉換地圖</h2><p>只有棋子位置、輪到哪方、易位權與吃過路兵狀態完全一致，才標為「精確同局面」。先比較走子順序，再決定你想保留哪一種開局選擇。</p></div><aside className="map-summary"><span><b>{groups.length}</b><small>轉換群組</small></span><i /><span><b>{groups.reduce((sum, item) => sum + item.routes.length, 0)}</b><small>合流走序</small></span></aside></div>
    <div className="transposition-layout">
      <nav className="transposition-group-list" aria-label="體系轉換群組">{groups.map((item) => <button className={item.id === group.id ? "active" : ""} key={item.id} onClick={() => setActiveGroup(item.id)}><span>{item.source === "curated" ? "精選" : "官方"}</span><b>{item.title}</b><small>{item.memberIds.length} 個體系・{item.routes.length} 條走序</small></button>)}</nav>
      <section className="transposition-detail" aria-live="polite"><header><div><span className="exact-badge">⇄ 精確同局面</span><h3>{group.title}</h3><p>{group.summary}</p></div><FenPositionPreview fen={group.targetFen} label="共同目標局面" /></header>
        <div className="transposition-routes">{group.routes.map((route, index) => <article key={`${route.line}-${index}`}><span>{index + 1}</span><div><b>{route.label}</b><p>{route.line}</p></div></article>)}</div>
        <div className="transposition-members"><h4>這些開局在此群組互相連接</h4><div>{members.map((opening) => <button key={opening.id} onClick={() => onSelect(opening.id)}><span>{opening.eco}</span><b>{opening.title_zh}</b><small>{opening.title_en}</small></button>)}</div></div>
      </section>
    </div>
  </div>;
}

function FenPositionPreview({ fen, label }: { fen: string; label: string }) {
  const position = useMemo(() => new Chess(fen).board().flatMap((row) => row), [fen]);
  const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;
  return <span className="opening-position-preview transposition-position" aria-label={label}><span className="preview-board cg-wrap" aria-hidden="true">{position.map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? "dark" : "light"} key={index}>{piece && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}` })}</span>)}</span><i>{label}</i></span>;
}

function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
