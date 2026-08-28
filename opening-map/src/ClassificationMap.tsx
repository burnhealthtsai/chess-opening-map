import type { FamilySummary, Opening, OpeningMapData } from "./types";
import { createElement, useEffect, useState } from "react";
import { openingIcon } from "./openingIcon";

const moveOrder = ["e4", "d4", "c4", "Nf3", "其他"];
const moveNames: Record<string, string> = {
  e4: "王兵起手",
  d4: "后兵起手",
  c4: "英式起手",
  Nf3: "列蒂起手",
  "其他": "不規則起手",
};
const responseNames: Record<string, string> = {
  knight: "馬類回應",
  center: "中央兵回應",
  "queen-wing": "后翼兵回應",
  "king-wing": "王翼兵回應",
};
const responseOrder: Record<string, number> = { "queen-wing": 0, center: 1, "king-wing": 2, knight: 3 };

type OverviewProps = {
  data: OpeningMapData;
  side: Opening["side"];
  category: string;
  activeMove: string | null;
  onMove: (move: string) => void;
  selectedOpeningId: string | null;
  recommendedMove?: string | null;
  recommendedPly?: number | null;
  onSubgroup: (move: string, subgroupId: string, replySans?: string[]) => void;
  onPreviewOpening: (openingId: string, step?: number, level?: string, label?: string, line?: string) => void;
  onSelectOpening: (openingId: string) => void;
};

export function ClassificationOverview({ data, side, category, activeMove, onMove, selectedOpeningId, recommendedMove, recommendedPly, onSubgroup, onPreviewOpening, onSelectOpening }: OverviewProps) {
  const [expandedSubgroup, setExpandedSubgroup] = useState<string | null>(null);
  const [collapsedMoves, setCollapsedMoves] = useState<Set<string>>(() => new Set());
  const scrollHintId = `taxonomy-scroll-hint-${side === "白方" ? "white" : "black"}`;
  useEffect(() => {
    setExpandedSubgroup(null);
    setCollapsedMoves(new Set());
  }, [side, category]);
  const eligible = (node: Opening) => node.side === side && (category === "全部" || node.category === category);
  const families = data.navigation.families.filter((family) => family.side === side);
  const zones = moveOrder.map((move) => {
    const nodes = data.nodes.filter((node) => eligible(node) && node.first_move === move);
    const familyItems = families.filter((family) => family.first_move === move).map((family) => ({
      ...family,
      count: nodes.filter((node) => node.family.id === family.id).length,
    })).filter((family) => family.count > 0);
    const subgroups = [...new Map(familyItems.map((family) => [family.subgroup.id, family.subgroup])).values()].map((subgroup) => {
      const subgroupFamilies = familyItems.filter((family) => family.subgroup.id === subgroup.id);
      const subgroupNodes = nodes.filter((node) => node.subgroup.id === subgroup.id);
      const replySans = uniqueSortedMoves(subgroupNodes.map((node) => move === "其他" ? node.first_move_san : node.reply_san));
      return { ...subgroup, sourceId: subgroup.id, families: subgroupFamilies, count: subgroupNodes.length, sample: subgroupNodes[0], replySans };
    }).sort((a, b) => (responseOrder[a.id] ?? 9) - (responseOrder[b.id] ?? 9));
    return { move, nodes, families: familyItems, subgroups };
  }).filter((zone) => zone.nodes.length);

  return <div className="classification-atlas" role="region" tabIndex={0} aria-label={`${side}開局樹狀分類圖`} aria-describedby={scrollHintId}>
    <p className="taxonomy-scroll-hint" id={scrollHintId}><span aria-hidden="true">↔</span>左右滑動或使用方向鍵查看更多開局</p>
    <aside className={`engine-map-guide ${recommendedMove ? "ready" : ""}`} aria-live="polite">
      <span aria-hidden="true">★</span><div><b>Stockfish 最佳棋步</b><small>{recommendedMove ? `目前推薦：${recommendedMove}，對應圓圈會金色閃爍` : "點選棋步後，可在 Live Board 查看局面與分析"}</small></div>
    </aside>
    <div className="taxonomy-zones">{zones.map((zone, index) => {
      const collapsed = collapsedMoves.has(zone.move);
      return <section className={`taxonomy-zone zone-${index} ${activeMove === zone.move ? "active" : ""} ${collapsed ? "collapsed" : ""}`} id={`families-${side}-${zone.move}`} key={zone.move}>
      <button className="move-hub" onClick={() => {
        setExpandedSubgroup(null);
        setCollapsedMoves((current) => {
          const next = new Set(current);
          if (next.has(zone.move)) next.delete(zone.move); else next.add(zone.move);
          return next;
        });
        if (collapsed) onMove(zone.move);
      }} aria-expanded={!collapsed}>
        <div className="move-symbol mover-white"><span className="move-circle"><MovePieceIcon san={zone.nodes[0]?.first_move_san} color="white" /><i>{zone.move}</i></span></div>
        <b>{moveNames[zone.move]}</b><small>{zone.families.length} 個家族 · {zone.nodes.length} 個分支</small><i className="zone-fold" aria-hidden="true">{collapsed ? "＋" : "−"}</i>
      </button>
      {!collapsed && <><div className="subgroup-branch-list">{zone.subgroups.map((subgroup) => {
        const key = `${zone.move}:${subgroup.id}`;
        const expanded = expandedSubgroup === key;
        const mover = zone.move === "其他" ? "white" : "black";
        const san = subgroup.replySans[0];
        const engineBest = mover === "black" && recommendedPly === 1 && Boolean(recommendedMove && subgroup.replySans.some((reply) => sameMove(reply, recommendedMove)));
        return <button className={`subgroup-branch ${expanded ? "expanded" : ""} ${engineBest ? "engine-best" : ""}`} key={key} onClick={() => { onMove(zone.move); onSubgroup(zone.move, subgroup.sourceId, subgroup.replySans); setExpandedSubgroup(expanded ? null : key); }} aria-expanded={expanded} aria-controls={expanded ? `subgroup-${side}-${zone.move}-${subgroup.id}` : undefined}>
          <div className={`subgroup-symbol mover-${mover}`}><span><MovePieceIcon san={san} color={mover} /><i className={subgroup.replySans.length > 1 ? "multiple-moves" : ""}>{subgroup.replySans.map((reply) => <span className={engineBest && recommendedMove && sameMove(reply, recommendedMove) ? "engine-best-move" : ""} key={reply}>{reply}</span>)}</i></span></div><b>{subgroupRoleName(subgroup.id, subgroup.label, mover)}</b><small>{subgroup.families.length} 個家族 · {subgroup.count} 個分支</small>
        </button>;
      })}</div>
      {zone.subgroups.map((subgroup) => {
        const key = `${zone.move}:${subgroup.id}`;
        if (expandedSubgroup !== key) return null;
        const familyGroups = groupFamiliesByRoute(subgroup.families);
        return <div className="subgroup-family-panel" id={`subgroup-${side}-${zone.move}-${subgroup.id}`} key={key}>
          <div className={`family-opening-groups ${subgroup.count <= 4 ? `compact-families family-count-${familyGroups.length}` : ""}`}>{familyGroups.map((familyGroup) => <InlineFamilyOpenings
              key={familyGroup.map((family) => family.id).join(":")}
              data={data}
              side={side}
              category={category}
              familyIds={familyGroup.map((family) => family.id)}
              hideRouteMove={subgroup.replySans.length === 1}
              selectedId={selectedOpeningId}
              recommendedMove={recommendedMove}
              recommendedPly={recommendedPly}
              onPreview={onPreviewOpening}
              onSelect={onSelectOpening}
            />)}</div>
        </div>;
      })}</>}
    </section>})}</div>
  </div>;
}

function FamilyBranch({ family, data, category, selected, onPreview }: { family: FamilySummary; data: OpeningMapData; category: string; selected: boolean; onPreview: () => void }) {
  const members = data.nodes.filter((node) => node.side === family.side && node.family.id === family.id && (category === "全部" || node.category === category));
  const examples = members.slice(0, 2).map((node) => node.title_zh).join("、");
  return <div className={`family-branch-wrap ${selected ? "selected" : ""}`}>
    <button className="family-branch" onClick={onPreview} aria-pressed={selected}>
      <div className={`family-symbol mover-${family.first_move === "其他" ? "white" : "black"}`}><span className="branch-node"><MovePieceIcon san={family.first_move === "其他" ? family.first_move_san : family.reply_san} color={family.first_move === "其他" ? "white" : "black"} /><i>{family.first_move === "其他" ? family.first_move_san : family.reply_san}</i></span></div>
      <b>{familyRouteLabel(family)}</b>
      <small>{members.length} 個分支 · {family.eco_min}{family.eco_min === family.eco_max ? "" : `–${family.eco_max}`}</small>
      <em>{examples}</em>
    </button>
  </div>;
}

function groupFamiliesByRoute(families: FamilySummary[]) {
  const groups = new Map<string, FamilySummary[]>();
  for (const family of families) {
    const route = family.first_move === "其他" ? family.first_move_san : family.reply_san;
    groups.set(route, [...(groups.get(route) ?? []), family]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => routeSortValue(left) - routeSortValue(right) || left.localeCompare(right))
    .map(([, items]) => items);
}

function routeSortValue(san: string) {
  const pieceOrder: Record<string, number> = { N: 0, B: 1, "": 2, R: 3, Q: 4, K: 5 };
  const piece = /^[NBRQK]/.test(san) ? san[0] : "";
  const square = san.match(/([a-h])([1-8])/);
  const file = square ? square[1].charCodeAt(0) - 97 : 9;
  const rank = square ? Number(square[2]) : 9;
  return (pieceOrder[piece] ?? 6) * 100 + file * 10 + rank;
}

function uniqueSortedMoves(moves: string[]) {
  return [...new Set(moves.filter(Boolean))]
    .sort((left, right) => routeSortValue(left) - routeSortValue(right) || left.localeCompare(right));
}

function subgroupRoleName(id: string, fallback: string, mover: "white" | "black") {
  const label = responseNames[id] ?? fallback;
  return mover === "white" ? label.replace(/回應$/, "起手") : label;
}

function InlineFamilyOpenings({ data, side, category, familyIds, hideRouteMove, selectedId, recommendedMove, recommendedPly, onPreview, onSelect }: { data: OpeningMapData; side: Opening["side"]; category: string; familyIds: string[]; hideRouteMove: boolean; selectedId: string | null; recommendedMove?: string | null; recommendedPly?: number | null; onPreview: (id: string, step?: number, level?: string, label?: string, line?: string) => void; onSelect: (id: string) => void }) {
  const [groupPath, setGroupPath] = useState<Record<number, string>>({});
  const family = data.navigation.families.find((item) => item.side === side && familyIds.includes(item.id));
  const members = data.nodes.filter((node) => node.side === side && familyIds.includes(node.family.id) && (category === "全部" || node.category === category))
    .sort((a, b) => a.eco.localeCompare(b.eco) || a.title_zh.localeCompare(b.title_zh, "zh-Hant"));
  const routeSan = family?.first_move === "其他" ? family.first_move_san : family?.reply_san;
  const routeColor: "white" | "black" = family?.first_move === "其他" ? "white" : "black";
  const capacity = Math.min(Math.max(members.length, 1), 4);
  return <section className={`inline-family-openings family-capacity-${capacity} ${hideRouteMove ? "route-hidden" : ""} ${members.length <= 4 ? "compact-family" : "wide-family"}`} aria-label={`${familyRouteLabel(family)}的開局`}>
    {!hideRouteMove && routeSan && <button className="family-frame-move" onClick={() => members[0] && onPreview(members[0].id, family?.first_move === "其他" ? 1 : 2, "家族棋步", routeSan)} aria-label={`${routeSan} 家族`}>
      <span className={`mover-${routeColor}`}><MovePieceIcon san={routeSan} color={routeColor} /><i>{routeSan}</i></span>
    </button>}
    <OpeningBranchLevel members={members} selectedId={selectedId} startPly={family?.first_move === "其他" ? 1 : 2} depth={0} forceSplit={members.length > 12} groupPath={groupPath} recommendedMove={recommendedMove} recommendedPly={recommendedPly}
      onGroup={(depth, key, step, sample) => { setGroupPath((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([level]) => Number(level) < depth)), [depth]: key })); onPreview(sample.id, step, "次次次分類", key); }}
      onPreview={onPreview} onSelect={onSelect} />
  </section>;
}

function OpeningBranchLevel({ members, selectedId, startPly, depth, forceSplit, groupPath, recommendedMove, recommendedPly, onGroup, onPreview, onSelect }: {
  members: Opening[]; selectedId: string | null; startPly: number; depth: number; forceSplit: boolean; groupPath: Record<number, string>;
  recommendedMove?: string | null; recommendedPly?: number | null;
  onGroup: (depth: number, key: string, step: number, sample: Opening) => void;
  onPreview: (id: string, step?: number, level?: string, label?: string, line?: string) => void; onSelect: (id: string) => void;
}) {
  const split = (forceSplit || members.length > 8) ? findNextSplit(members, startPly) : null;
  if (!split) return <OpeningButtons members={members} selectedId={selectedId} onPreview={onPreview} onSelect={onSelect} />;
  const activeKey = groupPath[depth];
  const pieceRows = groupMoveChoices(split.groups);
  return <div className={`deeper-branch-level depth-${depth}`}>
    <div className={`deeper-piece-rows depth-${depth}`}>{pieceRows.map((row) => <div className={`deeper-branch-grid depth-${depth} piece-row-${row.kind}`} key={row.kind}>{row.groups.map((group) => {
      const mover = split.ply % 2 === 0 ? "white" : "black";
      const engineBest = recommendedPly === split.ply && Boolean(recommendedMove && sameMove(group.key, recommendedMove));
      return <section className={`deeper-group-frame depth-${depth} ${group.members.length > 1 ? "major" : "minor"} ${group.members.length > 8 ? "large" : ""}`} data-move={group.key} key={group.key}>
        <button className={`${activeKey === group.key ? "selected" : ""} ${engineBest ? "engine-best" : ""}`} onClick={() => onGroup(depth, group.key, split.ply + 1, group.members[0])} aria-pressed={activeKey === group.key} aria-label={`${group.key}，${group.members.length} 個分支`}>
          <span className={`mover-${mover}`}><MovePieceIcon san={group.key} color={mover} /><i>{group.key}</i></span>
        </button>
        <div className="deeper-results"><OpeningBranchLevel members={group.members} selectedId={selectedId} startPly={split.ply + 1} depth={depth + 1} forceSplit={false} groupPath={groupPath} recommendedMove={recommendedMove} recommendedPly={recommendedPly} onGroup={onGroup} onPreview={onPreview} onSelect={onSelect} /></div>
      </section>;
    })}</div>)}</div>
  </div>;
}

function groupMoveChoices<T extends { key: string }>(groups: T[]) {
  const order = ["knight", "bishop", "pawn", "rook", "queen", "king", "other"];
  const rows = new Map<string, T[]>();
  for (const group of groups) {
    const kind = movePieceKind(group.key);
    rows.set(kind, [...(rows.get(kind) ?? []), group]);
  }
  return order.filter((kind) => rows.has(kind)).map((kind) => ({ kind, groups: rows.get(kind)! }));
}

function movePieceKind(san: string) {
  if (san.startsWith("N")) return "knight";
  if (san.startsWith("B")) return "bishop";
  if (san.startsWith("R")) return "rook";
  if (san.startsWith("Q")) return "queen";
  if (san.startsWith("K") || san.startsWith("O-O")) return "king";
  if (/^[a-h]/.test(san)) return "pawn";
  return "other";
}

function OpeningButtons({ members, selectedId, onPreview, onSelect }: { members: Opening[]; selectedId: string | null; onPreview: (id: string, step?: number, level?: string, label?: string, line?: string) => void; onSelect: (id: string) => void }) {
  const [study, setStudy] = useState<{ node: Opening; line: string; label: string } | null>(null);
  return <><div className="inline-opening-grid">{members.map((node) => {
    const zh = splitOpeningTitle(cleanDisplayTitle(node.title_zh));
    const en = splitOpeningTitle(cleanDisplayTitle(node.title_en));
    const icon = openingIcon(node.title_zh, node.title_en);
    const selected = selectedId === node.id;
    return <div className={`opening-planet-system ${selected ? "selected" : ""}`} key={node.id}>
      <button className={`opening-planet ${selected ? "selected" : ""}`} onClick={() => { setStudy(null); if (/歐文|Owen/i.test(`${node.title_zh} ${node.title_en}`)) onSelect(node.id); else onPreview(node.id); }} onDoubleClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(node.id); }} title={/歐文|Owen/i.test(`${node.title_zh} ${node.title_en}`) ? "開啟歐文防禦主頁" : "單擊在 Live Board 預覽，雙擊開啟詳情"}>
        <span>{node.eco}</span><b><span>{icon && <i className="opening-origin-icon" aria-hidden="true">{icon}</i>}{zh.head}</span>{zh.tail && <em>{zh.tail}</em>}</b><small><span>{en.head}</span>{en.tail && <em>{en.tail}</em>}</small>
      </button>
      {selected && node.variations.length > 0 && <div className="variation-satellites" aria-label={`${node.title_zh}的重點變例`}>
        {node.variations.slice(0, 3).map((variation, index) => <button className="variation-satellite" key={`${variation.name}-${index}`} onClick={(event) => { event.stopPropagation(); setStudy({ node, line: variation.line, label: cleanDisplayTitle(variation.name) }); onPreview(node.id, openingMoves(variation.line).length, "重點變例", variation.name, variation.line); }} onDoubleClick={(event) => { event.stopPropagation(); onSelect(node.id); }} title={`單擊播放 ${variation.name}，雙擊開啟詳情`}><span><i aria-hidden="true">{variationIcon(variation.name, index)}</i><small>{index + 1}</small></span><b>{cleanDisplayTitle(variation.name)}</b></button>)}
      </div>}
    </div>;
  })}</div></>;
}

function variationIcon(name: string, index: number) {
  if (/gambit|棄兵|犧牲/i.test(name)) return "⚔";
  if (/attack|攻擊|進攻/i.test(name)) return "♞";
  if (/defen|防禦|防守/i.test(name)) return "♜";
  if (/exchange|兌換|交換/i.test(name)) return "⇄";
  if (/classical|古典/i.test(name)) return "♔";
  if (/advance|推進/i.test(name)) return "♟";
  return ["✦", "◆", "●"][index % 3];
}

function cleanDisplayTitle(title: string) {
  return title.replace(/\s*(?:\.\.\.|…)+\s*/g, " ").replace(/\s+/g, " ").trim();
}

function familyRouteLabel(family?: FamilySummary) {
  if (!family) return "開局家族";
  return `白方 1.${family.first_move_san} · 黑方回應 1...${family.reply_san}`;
}

function splitOpeningTitle(title: string) {
  const match = title.match(/[:：]/);
  if (!match || match.index === undefined) return { head: title, tail: "" };
  const end = match.index + 1;
  return { head: title.slice(0, end), tail: title.slice(end).trim() };
}

function sameMove(left: string, right: string) {
  const normalize = (move: string) => move.replace(/[+#?!]+$/g, "").replace(/^\d+\.{1,3}/, "");
  return normalize(left) === normalize(right);
}

function findNextSplit(members: Opening[], startPly: number) {
  for (let ply = startPly; ply < 8; ply += 1) {
    const grouped = new Map<string, Opening[]>();
    for (const member of members) {
      const key = openingMoves(member.mainline)[ply] ?? "其他";
      grouped.set(key, [...(grouped.get(key) ?? []), member]);
    }
    if (grouped.size > 1) return { ply, groups: [...grouped].map(([key, nodes]) => ({ key, members: nodes })).sort((a, b) => routeSortValue(a.key) - routeSortValue(b.key) || b.members.length - a.members.length || a.key.localeCompare(b.key)) };
  }
  return null;
}

function openingMoves(line: string) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

function MovePieceIcon({ san, color }: { san?: string; color: "white" | "black" }) {
  const pieceKinds: Record<string, string> = { N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
  const kind = san ? (pieceKinds[san[0]] ?? (/^[a-h]/.test(san) ? "pawn" : null)) : null;
  if (!kind) return null;
  return <span className="map-piece-icon cg-wrap" aria-hidden="true">{createElement("piece", { className: `${kind} ${color}` })}</span>;
}

export function FamilyOpeningTree({ family, nodes, selectedId, onSelect }: { family: FamilySummary; nodes: Opening[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const ordered = [...nodes].sort((a, b) => a.eco.localeCompare(b.eco) || a.title_zh.localeCompare(b.title_zh, "zh-Hant"));
  return <div className="family-opening-tree" aria-label={`${familyRouteLabel(family)}開局分類圖`}>
    <div className="family-tree-root"><span>{family.first_move === "其他" ? `1.${family.first_move_san}` : family.reply_san}</span><div><b>{familyRouteLabel(family)}</b><small>{nodes.length} 個開局 · {family.eco_min}{family.eco_min === family.eco_max ? "" : `–${family.eco_max}`}</small></div></div>
    <div className="tree-stem" aria-hidden="true" />
    <div className="opening-tree-grid">{ordered.map((node) => <button className={`opening-tree-node ${selectedId === node.id ? "selected" : ""}`} key={node.id} onClick={() => onSelect(node.id)}>
      <span>{node.eco}</span><b>{node.title_zh}</b><small>{node.title_en}</small>
    </button>)}</div>
    {selected && <div className="variation-tree" aria-live="polite"><div className="variation-origin"><span>{selected.eco}</span><b>{selected.title_zh}</b></div><div className="variation-rail" aria-hidden="true" /><div className="variation-leaves">
      <span><i>主</i><b>代表主線</b></span>
      {selected.variations.slice(0, 3).map((variation, index) => <span key={`${variation.name}-${index}`}><i>{index + 1}</i><b>{variation.name}</b></span>)}
    </div><p>主線與三個重點變例已在右側詳情開啟，可逐手播放或自由走棋。</p></div>}
  </div>;
}
