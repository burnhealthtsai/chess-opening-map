import { openingIcon } from "./openingIcon";
import type { Opening, OpeningMapData } from "./types";
import "./StyleExplorer.css";

const all = "全部";
const firstMoveOrder = ["e4", "d4", "c4", "Nf3", "其他"];
const styleDescriptions: Record<string, string> = {
  局面: "重視兵形、空間與長期計畫",
  戰術: "快速製造威脅與具體計算",
  主動: "掌握先手並持續向對手施壓",
  穩健: "降低風險，建立可靠的發展",
  發展: "快速出子、控制中心與完成易位",
};

export default function StyleExplorer({ data, category, side, style, selectedId, onStyle, onSelect }: {
  data: OpeningMapData;
  category: string;
  side: string;
  style: string | null;
  selectedId: string | null;
  onStyle: (style: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const filter = (node: Opening) => (category === all || node.category === category) && (side === all || node.side === side);
  if (!style) return <Level title="你喜歡怎樣下棋？" intro="一個開局可以同時屬於多種風格。先選最想練習的局面特質。" step="五種學習入口">
    <div className="style-grid">{data.navigation.styles.map((item, index) => {
      const count = data.nodes.filter((node) => node.styles.includes(item.value) && filter(node)).length;
      return <button className={`style-card style-${index}`} key={item.value} onClick={() => onStyle(item.value)}><span aria-hidden="true">{["◎", "⚡", "↗", "◆", "♟"][index]}</span><b>{item.value}</b><p>{styleDescriptions[item.value]}</p><small>{count} 個開局　→</small></button>;
    })}</div>
  </Level>;
  const members = data.nodes.filter((node) => node.styles.includes(style) && filter(node));
  const groups = firstMoveOrder.map((move) => ({ move, nodes: members.filter((node) => node.first_move === move) })).filter((group) => group.nodes.length);
  return <><Breadcrumb items={[{ label: "學習風格", onClick: () => onStyle(null) }, { label: `${style}取向` }]} />
    <div className="family-header"><div><p className="eyebrow">STYLE COLLECTION</p><h2>{style}取向</h2><p>{styleDescriptions[style]}。共 {members.length} 個符合目前篩選的開局。</p></div><button onClick={() => onStyle(null)}>← 返回風格</button></div>
    {groups.length ? <div className="style-results">{groups.map((group) => <section key={group.move}><h3><span>{group.move}</span>{moveName(group.move)}<small>{group.nodes.length} 個</small></h3><div className="opening-card-grid">{group.nodes.map((node) => <OpeningCard key={node.id} node={node} selected={selectedId === node.id} onClick={() => onSelect(node.id)} />)}</div></section>)}</div> : <Empty />}
  </>;
}

function OpeningCard({ node, selected, onClick }: { node: Opening; selected?: boolean; onClick: () => void }) {
  const icon = openingIcon(node.title_zh, node.title_en);
  return <button className={`opening-card ${selected ? "selected" : ""}`} onClick={onClick}><span>{node.eco}</span><b>{icon && <i className="opening-origin-icon" aria-hidden="true">{icon}</i>}{node.title_zh}</b><small>{node.title_en}</small><em>{node.side} · {node.category}</em></button>;
}

function Level({ title, intro, step, children }: { title: string; intro: string; step: string; children: React.ReactNode }) {
  return <div className="level"><div className="level-heading"><div><p className="eyebrow">{step}</p><h2>{title}</h2><p>{intro}</p></div></div>{children}</div>;
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return <nav className="breadcrumb" aria-label="目前位置">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <i>›</i>}{item.onClick ? <button onClick={item.onClick}>{item.label}</button> : <b>{item.label}</b>}</span>)}</nav>;
}

function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
function moveName(move: string) { return ({ e4: "王兵起手", d4: "后兵起手", c4: "英式起手", Nf3: "列蒂起手", 其他: "不規則起手" } as Record<string, string>)[move] ?? move; }
