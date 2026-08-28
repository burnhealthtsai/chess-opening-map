import { Chess } from "chess.js";
import { createElement, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Opening, TranspositionGroup } from "./types";
import "./TranspositionExplorer.css";

export default function TranspositionExplorer({ nodes, groups, onSelect }: { nodes: Opening[]; groups: TranspositionGroup[]; onSelect: (id: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? null);
  const groupListRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const group = groups.find((item) => item.id === activeGroup) ?? groups[0];
  const members = group?.memberIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node)) ?? [];
  if (!group) return <Empty />;
  function selectGroup(id: string, revealDetail = false) {
    setActiveGroup(id);
    if (revealDetail && window.matchMedia("(max-width: 820px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }));
    }
  }
  function returnToGroups() {
    const active = groupListRef.current?.querySelector<HTMLButtonElement>("[aria-selected='true']");
    active?.focus({ preventScroll: true });
    active?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
  }
  function moveGroup(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const previous = ["ArrowUp", "ArrowLeft", "w", "a"].includes(key);
    const next = ["ArrowDown", "ArrowRight", "s", "d"].includes(key);
    if (!previous && !next && key !== "Home" && key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    const target = key === "Home" ? 0 : key === "End" ? groups.length - 1 : (index + (previous ? -1 : 1) + groups.length) % groups.length;
    selectGroup(groups[target].id);
    requestAnimationFrame(() => groupListRef.current?.querySelectorAll<HTMLButtonElement>("button")[target]?.focus());
  }
  return <div className="transposition-explorer">
    <div className="directory-heading with-summary"><div><p className="eyebrow">TRANSPOSITION ATLAS</p><h2>體系轉換地圖</h2><p>只有棋子位置、輪到哪方、易位權與吃過路兵狀態完全一致，才標為「精確同局面」。先比較走子順序，再決定你想保留哪一種開局選擇。</p></div><aside className="map-summary"><span><b>{groups.length}</b><small>轉換群組</small></span><i /><span><b>{groups.reduce((sum, item) => sum + item.routes.length, 0)}</b><small>合流走序</small></span></aside></div>
    <div className="transposition-layout">
      <div className="transposition-directory"><p className="group-keyboard-hint">鍵盤：W／A／↑／← 上一組・S／D／↓／→ 下一組・Home／End 跳到兩端</p><nav ref={groupListRef} className="transposition-group-list" role="tablist" aria-label="體系轉換群組">{groups.map((item, index) => <button type="button" role="tab" id={`transposition-tab-${item.id}`} aria-controls="transposition-group-detail" aria-selected={item.id === group.id} aria-keyshortcuts="ArrowUp ArrowLeft W A ArrowDown ArrowRight S D Home End" tabIndex={item.id === group.id ? 0 : -1} className={item.id === group.id ? "active" : ""} key={item.id} onClick={(event) => selectGroup(item.id, event.detail > 0)} onKeyDown={(event) => moveGroup(event, index)}><span>{item.source === "curated" ? "精選" : "官方"}</span><b>{item.title}</b><small>{item.memberIds.length} 個體系・{item.routes.length} 條走序</small></button>)}</nav></div>
      <section ref={detailRef} className="transposition-detail" id="transposition-group-detail" role="tabpanel" aria-labelledby={`transposition-tab-${group.id}`} aria-live="polite"><button type="button" className="group-return-button" onClick={returnToGroups}>↑ 返回群組清單</button><header><div><span className="exact-badge">⇄ 精確同局面</span><h3>{group.title}</h3><p>{group.summary}</p></div><FenPositionPreview fen={group.targetFen} label="共同目標局面" /></header>
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
function preferredScrollBehavior(): ScrollBehavior { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
