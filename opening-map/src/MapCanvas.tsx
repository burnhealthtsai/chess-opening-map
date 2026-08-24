import { useMemo } from "react";
import type { Edge, Opening } from "./types";

type Props = {
  nodes: Opening[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type PlacedNode = Opening & { x: number; y: number; band: string };

function ecoBand(eco: string) {
  const start = Math.floor(Number(eco.slice(1)) / 10) * 10;
  return `${eco[0]}${String(start).padStart(2, "0")}–${eco[0]}${String(start + 9).padStart(2, "0")}`;
}

function layout(nodes: Opening[]) {
  const grouped = new Map<string, Opening[]>();
  for (const node of [...nodes].sort((a, b) => a.eco.localeCompare(b.eco) || a.title_zh.localeCompare(b.title_zh, "zh-Hant"))) {
    const band = ecoBand(node.eco);
    grouped.set(band, [...(grouped.get(band) ?? []), node]);
  }
  const placed: PlacedNode[] = [];
  const headers: { label: string; x: number; width: number }[] = [];
  let cursor = 24;
  for (const [band, members] of grouped) {
    const columns = Math.ceil(members.length / 10);
    const width = Math.max(146, columns * 146);
    headers.push({ label: band, x: cursor, width });
    members.forEach((node, index) => placed.push({
      ...node,
      band,
      x: cursor + 65 + (Math.floor(index / 10) * 146),
      y: 78 + (index % 10) * 68,
    }));
    cursor += width + 22;
  }
  return { placed, headers, width: Math.max(480, cursor + 2), height: Math.max(340, 110 + Math.min(10, Math.max(...[...grouped.values()].map((items) => items.length), 1)) * 68) };
}

export function MapCanvas({ nodes, edges, selectedId, onSelect }: Props) {
  const graph = useMemo(() => layout(nodes), [nodes]);
  const positions = useMemo(() => new Map(graph.placed.map((node) => [node.id, node])), [graph]);
  const activeEdges = useMemo(() => selectedId ? edges
    .filter((edge) => edge.source === selectedId || edge.target === selectedId)
    .filter((edge) => positions.has(edge.source) && positions.has(edge.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3) : [], [edges, positions, selectedId]);
  const neighbours = new Set(activeEdges.flatMap((edge) => [edge.source, edge.target]));

  return <div className="family-map-scroll" tabIndex={0} aria-label="可橫向瀏覽的開局家族圖">
    <svg className="family-map" viewBox={`0 0 ${graph.width} ${graph.height}`} style={{ width: graph.width, height: graph.height }}>
      {graph.headers.map((header) => <g key={header.label}>
        <rect className="eco-lane" x={header.x - 8} y={16} width={header.width} height={graph.height - 32} rx={16} />
        <text className="eco-heading" x={header.x + 4} y={43}>{header.label}</text>
      </g>)}
      <g className="active-links">
        {activeEdges.map((edge) => {
          const source = positions.get(edge.source)!;
          const target = positions.get(edge.target)!;
          return <line key={`${edge.source}:${edge.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
        })}
      </g>
      <g>
        {graph.placed.map((node) => {
          const active = node.id === selectedId;
          const related = neighbours.has(node.id);
          return <g key={node.id} className={`map-card ${active ? "selected" : ""} ${selectedId && !related ? "quiet" : ""}`}
            transform={`translate(${node.x},${node.y})`} role="button" tabIndex={0}
            aria-label={`檢視${node.title_zh}，${node.eco}`}
            onClick={() => onSelect(node.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
            <circle r={active ? 24 : 19} />
            <text className="map-card-meta" x={0} y={4}>{node.eco}</text>
            <text className="map-card-name" x={0} y={34}>{node.title_zh.length > 8 ? `${node.title_zh.slice(0, 8)}…` : node.title_zh}</text>
            <title>{node.title_zh} · {node.title_en}</title>
          </g>;
        })}
      </g>
    </svg>
  </div>;
}
