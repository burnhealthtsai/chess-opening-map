import { createElement, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard, prepareChessSound } from "./Chessboard";
import { ClassificationOverview, FamilyOpeningTree } from "./ClassificationMap";
import { openingIcon } from "./openingIcon";
import { installPieceTheme } from "./pieceThemes";
import { shouldStartLiveBoardMinimized } from "./responsive";
import type { Opening, OpeningMapData, RelationMode } from "./types";

const OpeningDetail = lazy(() => import("./OpeningDetail"));

type Lens = "family" | "concept" | "opponent" | "puzzles" | "style" | "transpositions" | "analogies";
const all = "全部";
const firstMoveOrder = ["e4", "d4", "c4", "Nf3", "其他"];
const pieceStyles = [
  ["original", "原版棋子"],
  ["magic", "魔法學院風格"], ["fairytale", "迪士尼童話風格（原創）"], ["ceramic-storybook", "手繪陶瓷棋子"], ["neon-punk", "霓虹龐克棋子"], ["egyptian-monument", "古埃及雕像棋子"], ["forest-anime", "手繪森林動畫"], ["warcraft", "史詩獸人風格"],
  ["zombie", "殭屍末日風格"], ["robot", "機器人風格"], ["myth", "神話風格"], ["egypt", "埃及風格"],
  ["india", "印度風格"], ["china", "中國風格"], ["japan", "日本風格"], ["europe", "歐洲風格"],
] as const;
const boardStyles = [
  ["wood", "經典木棋盤"], ["walnut", "胡桃木"], ["ocean", "海洋藍"], ["forest", "森林綠"], ["slate", "石板灰"],
  ["royal", "皇家紫"], ["rose", "玫瑰粉"], ["sand", "沙漠金"], ["mint", "薄荷綠"], ["night", "午夜棋盤"],
] as const;
const styleDescriptions: Record<string, string> = {
  局面: "重視兵形、空間與長期計畫",
  戰術: "快速製造威脅與具體計算",
  主動: "掌握先手並持續向對手施壓",
  穩健: "降低風險，建立可靠的發展",
  發展: "快速出子、控制中心與完成易位",
};

type NotionPuzzle = {
  id: string; title: string; fen: string; side: "白方" | "黑方"; themes: string[];
  previousFen?: string; previousMove?: string;
  difficulty: string; classification: string; deltaCp: number; wrongMove: string;
  stage: number; dueAt: string; attempts: number; accuracy: number;
  notionUrl: string; gameUrl: string;
};
type NotionPuzzleCatalog = { source: string; exportedAt: string; count: number; puzzles: NotionPuzzle[] };

function sideFromFen(fen: string) {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}

function sideLabelFromFen(fen: string) {
  return sideFromFen(fen) === "white" ? "白方" : "黑方";
}

export function App() {
  const [data, setData] = useState<OpeningMapData | null>(null);
  const [lens, setLens] = useState<Lens>("family");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(all);
  const [styleSide, setStyleSide] = useState(all);
  const [selectedSide, setSelectedSide] = useState<Opening["side"]>("白方");
  const [selectedFirstMove, setSelectedFirstMove] = useState<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [pieceStyle, setPieceStyle] = useState<(typeof pieceStyles)[number][0]>("original");
  const [boardStyle, setBoardStyle] = useState<(typeof boardStyles)[number][0]>("wood");

  useEffect(() => {
    fetch("./opening-map.json").then((response) => response.ok ? response.json() : Promise.reject()).then(setData).catch(() => setData(null));
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  useEffect(() => {
    document.documentElement.dataset.pieceStyle = pieceStyle;
    installPieceTheme(pieceStyle);
  }, [pieceStyle]);
  useEffect(() => { document.documentElement.dataset.boardStyle = boardStyle; }, [boardStyle]);

  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;
  const relationMode: RelationMode = lens === "family" ? "family" : "style";
  const neighbours = useMemo(() => {
    if (!selected || !data) return [] as Opening[];
    const ranked = data.edges[relationMode]
      .filter((edge) => edge.source === selected.id || edge.target === selected.id)
      .map((edge) => ({ id: edge.source === selected.id ? edge.target : edge.source, weight: edge.weight }))
      .sort((a, b) => b.weight - a.weight).slice(0, 5);
    return ranked.map(({ id }) => data.nodes.find((node) => node.id === id)!).filter(Boolean);
  }, [data, relationMode, selected]);
  const searchResults = useMemo(() => {
    if (!data || !query.trim()) return [];
    const needle = query.trim().toLowerCase();
    return data.nodes.filter((node) => `${node.title_zh} ${node.title_en} ${node.eco}`.toLowerCase().includes(needle)
      && (category === all || node.category === category)
      && (styleSide === all || node.side === styleSide));
  }, [category, data, query, styleSide]);

  function switchLens(next: Lens) {
    setLens(next); setSelectedId(null); setQuery("");
    if (next !== "style") setSelectedStyle(null);
  }
  function home() { setSelectedFirstMove(null); setSelectedFamily(null); setSelectedId(null); }
  function openSide(side: Opening["side"]) { setSelectedSide(side); setSelectedFirstMove(null); setSelectedFamily(null); setSelectedId(null); }
  function openFirstMove(move: string) { setSelectedFirstMove(move); setSelectedFamily(null); setSelectedId(null); }
  function openFamily(id: string) { setSelectedFamily(id); setSelectedId(null); }
  function selectOpening(id: string) { prepareChessSound(); setSelectedId(id); }
  async function copyLine(line: string) { await navigator.clipboard?.writeText(line); }

  // Let the atlas be explored without needing to aim at every small opening node.
  useEffect(() => {
    const lenses: Lens[] = ["family", "concept", "opponent", "puzzles", "style", "transpositions", "analogies"];
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        switchLens(lenses[(lenses.indexOf(lens) + 1) % lenses.length]);
        return;
      }
      if (!data || !["w", "a", "s", "d", "W", "A", "S", "D"].includes(event.key)) return;
      const candidates = data.nodes.filter((node) => (category === all || node.category === category) && (lens !== "family" || node.side === selectedSide))
        .sort((a, b) => a.eco.localeCompare(b.eco) || a.title_zh.localeCompare(b.title_zh, "zh-Hant"));
      if (!candidates.length) return;
      event.preventDefault();
      const index = Math.max(0, candidates.findIndex((node) => node.id === selectedId));
      const change = event.key.toLowerCase() === "w" || event.key.toLowerCase() === "a" ? -1 : 1;
      selectOpening(candidates[(index + change + candidates.length) % candidates.length].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [category, data, lens, selectedId, selectedSide]);

  if (!data) return <main className="loading">正在建立清楚的開局學習路線…</main>;
  return <main>
    <header className="hero">
      <div><p className="eyebrow">CHESS OPENING ATLAS</p><h1>西洋棋開局地圖</h1><p>先看大方向，再逐步走進每個開局家族。</p></div>
      <div className="hero-actions"><label><span>棋子風格</span><select value={pieceStyle} onChange={(event) => setPieceStyle(event.target.value as typeof pieceStyle)}>{pieceStyles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>棋盤風格</span><select value={boardStyle} onChange={(event) => setBoardStyle(event.target.value as typeof boardStyle)}>{boardStyles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="theme-button" onClick={() => setDark((value) => !value)}>{dark ? "☀ 淺色" : "☾ 深色"}</button></div>
    </header>

    <nav className="lens-tabs" aria-label="探索方式">
      <button className={lens === "family" ? "active" : ""} onClick={() => switchLens("family")}><span>♞</span><b>棋路地圖</b><small>依照首步與回應逐層探索</small></button>
      <button className={lens === "concept" ? "active" : ""} onClick={() => switchLens("concept")}><span>◎</span><b>中心思想</b><small>開局、中局與各類殘局下法</small></button>
      <button className={lens === "opponent" ? "active" : ""} onClick={() => switchLens("opponent")}><span>♚</span><b>對手練習</b><small>選擇不同等級直接實戰</small></button>
      <button className={lens === "puzzles" ? "active" : ""} onClick={() => switchLens("puzzles")}><span>◆</span><b>謎題訓練</b><small>從自己的失誤建立複習題</small></button>
      <button className={lens === "style" ? "active" : ""} onClick={() => switchLens("style")}><span>✦</span><b>學習風格</b><small>從局面、戰術與計畫找到開局</small></button>
      <button className={lens === "transpositions" ? "active" : ""} onClick={() => switchLens("transpositions")}><span>⇄</span><b>體系轉換</b><small>比較不同走序如何進入同一局面</small></button>
      <button className={lens === "analogies" ? "active" : ""} onClick={() => switchLens("analogies")}><span>≈</span><b>類似比較</b><small>黑方防禦對照白方進攻體系</small></button>
    </nav>

    <section className="compact-toolbar" aria-label="搜尋與篩選">
      <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋開局、中英文或 ECO" /></label>
      {(lens === "style" || query) && <Filter label="陣營" value={styleSide} values={[all, "白方", "黑方"]} onChange={setStyleSide} />}
      <Filter label="類別" value={category} values={[all, "主流", "趣味"]} onChange={setCategory} />
      {(query || category !== all || styleSide !== all) && <button className="clear-button" onClick={() => { setQuery(""); setCategory(all); setStyleSide(all); }}>清除</button>}
      <a className="notion-opening-link" href="https://app.notion.com/p/3acea00652918196baa0c23ddfc859a5" target="_blank" rel="noreferrer"><span>▣</span>開啟 Notion 開局資料庫 ↗</a>
    </section>

    {query.trim() ? <SearchResults nodes={searchResults} query={query} onSelect={selectOpening} /> : <div className={selected ? "workspace focused" : "workspace single"}>
      <section className={`explorer-panel ${lens === "family" && selectedSide && !selectedFamily ? "split-overview" : ""}`}>
        {lens === "family" ? <FamilyExplorer data={data} category={category} side={selectedSide} firstMove={selectedFirstMove} familyId={selectedFamily}
          selectedId={selectedId} onHome={home} onSide={openSide} onFirstMove={openFirstMove} onFamily={openFamily} onSelect={selectOpening} />
          : lens === "concept" ? <ConceptExplorer />
          : lens === "opponent" ? <OpponentExplorer data={data} />
          : lens === "puzzles" ? <PuzzleExplorer />
          : lens === "style" ? <StyleExplorer data={data} category={category} side={styleSide} style={selectedStyle} selectedId={selectedId} onStyle={(value) => { setSelectedStyle(value); setSelectedId(null); }} onSelect={selectOpening} />
          : lens === "transpositions" ? <TranspositionExplorer data={data} onSelect={selectOpening} />
          : <AnalogyExplorer data={data} onSelect={selectOpening} />}
      </section>
      {selected && <aside className={`detail open ${/歐文|Owen/i.test(`${selected.title_zh} ${selected.title_en}`) ? "opening-home-modal" : ""}`} aria-live="polite"><Suspense fallback={<div className="loading-inline" role="status">正在載入開局詳情…</div>}><OpeningDetail key={selected.id} opening={selected} neighbours={neighbours} onSelect={selectOpening} onCopy={copyLine} onClose={() => setSelectedId(null)} /></Suspense></aside>}
    </div>}
    {query.trim() && selected && <aside className="detail modal-detail" aria-live="polite"><Suspense fallback={<div className="loading-inline" role="status">正在載入開局詳情…</div>}><OpeningDetail key={selected.id} opening={selected} neighbours={neighbours} onSelect={selectOpening} onCopy={copyLine} onClose={() => setSelectedId(null)} /></Suspense></aside>}
  </main>;
}

function FamilyExplorer({ data, category, side, firstMove, familyId, selectedId, onHome, onSide, onFirstMove, onFamily, onSelect }: {
  data: OpeningMapData; category: string; side: Opening["side"]; firstMove: string | null; familyId: string | null; selectedId: string | null;
  onHome: () => void; onSide: (side: Opening["side"]) => void; onFirstMove: (move: string) => void; onFamily: (id: string) => void; onSelect: (id: string) => void;
}) {
  const [mapPreview, setMapPreview] = useState<{ openingId: string; step: number; fromStep: number; level: string; label: string; familyId: string | null; line?: string } | null>(null);
  const [recommendedMove, setRecommendedMove] = useState<string | null>(null);
  const previewTimers = useRef<number[]>([]);
  function cancelPreviewCycle() {
    previewTimers.current.forEach((timer) => window.clearTimeout(timer));
    previewTimers.current = [];
  }
  useEffect(() => {
    setMapPreview(null);
    setRecommendedMove(null);
    cancelPreviewCycle();
    return cancelPreviewCycle;
  }, [side, category]);
  const eligible = (node: Opening) => category === all || node.category === category;
  const sideSwitcher = <SideSwitcher data={data} category={category} side={side} onSide={onSide} />;

  const crumb = <Breadcrumb items={[{ label: "棋路地圖", onClick: onHome }, { label: side, onClick: () => onSide(side) }, ...(familyId && firstMove ? [{ label: firstMove, onClick: () => onFirstMove(firstMove) }] : []), ...(familyId ? [{ label: data.navigation.families.find((family) => family.id === familyId && family.side === side)?.label ?? familyId }] : [])]} />;
  if (!familyId) {
    const previewMove = firstMove ?? "e4";
    const previewOpening = data.nodes.find((node) => node.side === side && node.first_move === previewMove && eligible(node))
      ?? data.nodes.find((node) => node.side === side && node.first_move === previewMove);
    const activePreview = (mapPreview && data.nodes.find((node) => node.id === mapPreview.openingId))
      ? { ...mapPreview, opening: data.nodes.find((node) => node.id === mapPreview.openingId)! }
      : previewOpening ? { opening: previewOpening, step: 1, fromStep: 0, level: "第一手", label: previewMove, familyId: null, line: undefined } : null;
    function representative(move: string, subgroupId?: string, targetFamilyId?: string, replySan?: string) {
      const matchesRoute = (node: Opening) => !replySan || (move === "其他" ? node.first_move_san === replySan : node.reply_san === replySan);
      return data.nodes.find((node) => node.side === side && node.first_move === move && (!subgroupId || node.subgroup.id === subgroupId) && (!targetFamilyId || node.family.id === targetFamilyId) && matchesRoute(node) && eligible(node))
        ?? data.nodes.find((node) => node.side === side && node.first_move === move && (!subgroupId || node.subgroup.id === subgroupId) && (!targetFamilyId || node.family.id === targetFamilyId) && matchesRoute(node));
    }
    function previewFirstMove(move: string, scroll = false) {
      cancelPreviewCycle();
      prepareChessSound();
      setRecommendedMove(null);
      const opening = representative(move);
      onFirstMove(move);
      if (opening) setMapPreview({ openingId: opening.id, step: 1, fromStep: 0, level: "第一手", label: opening.first_move_san, familyId: null });
      if (scroll) requestAnimationFrame(() => document.getElementById(`families-${side}-${move}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    function previewSubgroup(move: string, subgroupId: string, replySans: string[] = []) {
      cancelPreviewCycle();
      prepareChessSound();
      setRecommendedMove(null);
      const alternatives = [...new Set(replySans)].map((replySan) => ({ replySan, opening: representative(move, subgroupId, undefined, replySan) })).filter((item): item is { replySan: string; opening: Opening } => Boolean(item.opening));
      if (!alternatives.length) {
        const opening = representative(move, subgroupId);
        if (opening) alternatives.push({ replySan: move === "其他" ? opening.first_move_san : opening.reply_san, opening });
      }
      alternatives.forEach(({ replySan, opening }, index) => {
        const showAlternative = () => {
          setRecommendedMove(null);
          setMapPreview({ openingId: opening.id, step: move === "其他" ? 1 : 2, fromStep: 0, level: alternatives.length > 1 ? `次分類 · ${index + 1}/${alternatives.length}` : "次分類", label: alternatives.length > 1 ? `${opening.subgroup.label} · ${replySan}` : opening.subgroup.label, familyId: null, line: opening.mainline });
        };
        if (index === 0) showAlternative();
        else previewTimers.current.push(window.setTimeout(showAlternative, index * 2300));
      });
    }
    function previewBranch(openingId: string, requestedStep?: number, level = "開局預覽", label?: string, previewLine?: string) {
      cancelPreviewCycle();
      prepareChessSound();
      setRecommendedMove(null);
      const opening = data.nodes.find((node) => node.id === openingId);
      if (!opening) return;
      const line = previewLine ?? opening.mainline;
      const nextMoves = lineMoves(line);
      const step = Math.min(requestedStep ?? nextMoves.length, nextMoves.length);
      const priorOpening = mapPreview ? data.nodes.find((node) => node.id === mapPreview.openingId) : null;
      const priorMoves = priorOpening ? lineMoves(mapPreview?.line ?? priorOpening.mainline).slice(0, mapPreview?.step ?? 0) : [];
      let fromStep = 0;
      while (fromStep < step && priorMoves[fromStep] === nextMoves[fromStep]) fromStep += 1;
      setMapPreview({ openingId: opening.id, step, fromStep, level, label: label ?? opening.title_zh, familyId: opening.family.id, line });
    }
    const sideNodes = data.nodes.filter((node) => node.side === side && eligible(node));
    const variationCount = sideNodes.reduce((total, node) => total + node.variations.length, 0);
    return <>{sideSwitcher}<section className="family-directory detached">{crumb}<div className="directory-heading with-summary"><div><p className="eyebrow">OPENING TAXONOMY</p><h2>{side}的開局分類地圖</h2><p>從第一手進入色彩分區，再選擇回應類型與開局家族。右側棋盤會依順序同步每一手。</p></div><aside className="map-summary" aria-label={`${side}開局統計`}><span><b>{sideNodes.length}</b><small>主開局</small></span><i /><span><b>{variationCount}</b><small>分支變例</small></span></aside></div>
      <div className="taxonomy-with-board"><ClassificationOverview data={data} side={side} category={category} activeMove={firstMove} onMove={(move) => previewFirstMove(move)} selectedOpeningId={mapPreview && (mapPreview.level === "開局預覽" || mapPreview.level === "重點變例") ? mapPreview.openingId : null} recommendedMove={recommendedMove} recommendedPly={activePreview?.step ?? null} onSubgroup={previewSubgroup} onPreviewOpening={previewBranch} onSelectOpening={onSelect} />
        {activePreview && <MapBoardPreview opening={activePreview.opening} line={activePreview.line} step={activePreview.step} fromStep={activePreview.fromStep} level={activePreview.level} label={activePreview.label} onBestMove={setRecommendedMove} />}
      </div>
    </section></>;
  }

  if (!firstMove) return <Empty />;
  const family = data.navigation.families.find((item) => item.side === side && item.first_move === firstMove && item.id === familyId);
  const members = data.nodes.filter((node) => node.side === side && node.family.id === familyId && eligible(node));
  return <>{sideSwitcher}{crumb}<div className="family-header"><div><p className="eyebrow">{family?.eco_min}{family?.eco_min !== family?.eco_max ? `–${family?.eco_max}` : ""}</p><h2>{family?.label}</h2><p>{members.length} 個開局已依 ECO 排列成清楚樹狀分支。點選圓點後，下方會展開主線與三個重點變例。</p></div><button onClick={() => onFirstMove(firstMove)}>← 返回分類地圖</button></div>
    {members.length && family ? <FamilyOpeningTree family={family} nodes={members} selectedId={selectedId} onSelect={onSelect} /> : <Empty />}
  </>;
}

function SideSwitcher({ data, category, side, onSide }: { data: OpeningMapData; category: string; side: Opening["side"]; onSide: (side: Opening["side"]) => void }) {
  return <nav className="side-switcher" aria-label="切換白方或黑方開局">
    {(["白方", "黑方"] as const).map((value) => {
      const count = data.nodes.filter((node) => node.side === value && (category === all || node.category === category)).length;
      return <button className={`${value === side ? "active" : ""} ${value === "黑方" ? "black-side" : "white-side"}`} key={value} onClick={() => onSide(value)} aria-pressed={value === side}>
        <span>{value === "白方" ? "♔" : "♚"}</span><b>{value}開局</b><small>{count} 個開局</small>
      </button>;
    })}
  </nav>;
}

function StyleExplorer({ data, category, side, style, selectedId, onStyle, onSelect }: { data: OpeningMapData; category: string; side: string; style: string | null; selectedId: string | null; onStyle: (style: string | null) => void; onSelect: (id: string) => void }) {
  const filter = (node: Opening) => (category === all || node.category === category) && (side === all || node.side === side);
  if (!style) return <Level title="你喜歡怎樣下棋？" intro="一個開局可以同時屬於多種風格。先選最想練習的局面特質。" step="五種學習入口">
    <div className="style-grid">{data.navigation.styles.map((item, index) => {
      const count = data.nodes.filter((node) => node.styles.includes(item.value) && filter(node)).length;
      return <button className={`style-card style-${index}`} key={item.value} onClick={() => onStyle(item.value)}><span>{["◎", "⚡", "↗", "◆", "♟"][index]}</span><b>{item.value}</b><p>{styleDescriptions[item.value]}</p><small>{count} 個開局　→</small></button>;
    })}</div>
  </Level>;
  const members = data.nodes.filter((node) => node.styles.includes(style) && filter(node));
  const groups = firstMoveOrder.map((move) => ({ move, nodes: members.filter((node) => node.first_move === move) })).filter((group) => group.nodes.length);
  return <><Breadcrumb items={[{ label: "學習風格", onClick: () => onStyle(null) }, { label: `${style}取向` }]} />
    <div className="family-header"><div><p className="eyebrow">STYLE COLLECTION</p><h2>{style}取向</h2><p>{styleDescriptions[style]}。共 {members.length} 個符合目前篩選的開局。</p></div><button onClick={() => onStyle(null)}>← 返回風格</button></div>
    {groups.length ? <div className="style-results">{groups.map((group) => <section key={group.move}><h3><span>{group.move}</span>{moveName(group.move)}<small>{group.nodes.length} 個</small></h3><div className="opening-card-grid">{group.nodes.map((node) => <OpeningCard key={node.id} node={node} selected={selectedId === node.id} onClick={() => onSelect(node.id)} />)}</div></section>)}</div> : <Empty />}
  </>;
}

function TranspositionExplorer({ data, onSelect }: { data: OpeningMapData; onSelect: (id: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(data.transpositionGroups[0]?.id ?? null);
  const group = data.transpositionGroups.find((item) => item.id === activeGroup) ?? data.transpositionGroups[0];
  const members = group?.memberIds.map((id) => data.nodes.find((node) => node.id === id)).filter((node): node is Opening => Boolean(node)) ?? [];
  if (!group) return <Empty />;
  return <div className="transposition-explorer">
    <div className="directory-heading with-summary"><div><p className="eyebrow">TRANSPOSITION ATLAS</p><h2>體系轉換地圖</h2><p>只有棋子位置、輪到哪方、易位權與吃過路兵狀態完全一致，才標為「精確同局面」。先比較走子順序，再決定你想保留哪一種開局選擇。</p></div><aside className="map-summary"><span><b>{data.transpositionGroups.length}</b><small>轉換群組</small></span><i /><span><b>{data.transpositionGroups.reduce((sum, item) => sum + item.routes.length, 0)}</b><small>合流走序</small></span></aside></div>
    <div className="transposition-layout">
      <nav className="transposition-group-list" aria-label="體系轉換群組">{data.transpositionGroups.map((item) => <button className={item.id === group.id ? "active" : ""} key={item.id} onClick={() => setActiveGroup(item.id)}><span>{item.source === "curated" ? "精選" : "官方"}</span><b>{item.title}</b><small>{item.memberIds.length} 個體系・{item.routes.length} 條走序</small></button>)}</nav>
      <section className="transposition-detail" aria-live="polite"><header><div><span className="exact-badge">⇄ 精確同局面</span><h3>{group.title}</h3><p>{group.summary}</p></div><FenPositionPreview fen={group.targetFen} label="共同目標局面" /></header>
        <div className="transposition-routes">{group.routes.map((route, index) => <article key={`${route.line}-${index}`}><span>{index + 1}</span><div><b>{route.label}</b><p>{route.line}</p></div></article>)}</div>
        <div className="transposition-members"><h4>這些開局在此群組互相連接</h4><div>{members.map((opening) => <button key={opening.id} onClick={() => onSelect(opening.id)}><span>{opening.eco}</span><b>{opening.title_zh}</b><small>{opening.title_en}</small></button>)}</div></div>
      </section>
    </div>
  </div>;
}

const analogyRelationLabels = {
  reversed: "反色對應",
  structure: "結構相似",
  plan: "計畫相似",
} as const;

function AnalogyExplorer({ data, onSelect }: { data: OpeningMapData; onSelect: (id: string) => void }) {
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

const endgameLessons = [
  { icon: "♖", title: "車兵殘局", text: "車放在通路兵後方；王先靠近中心，再從側面將軍。", fen: "8/5pk1/6p1/3R3p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先檢查雙方通路兵，車優先站到通路兵後面。", "王向中心靠近，但避免被對方車連續將軍。", "無法直接吃兵時，改由側面將軍逼王離開。"] },
  { icon: "♕", title: "后兵殘局", text: "先確保永將安全，再用后同時攻王與兵；避免無意義換后。", fen: "8/5pk1/6p1/3Q3p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先找將軍與雙攻，不要只推兵。", "讓自己的王避開連續將軍路線。", "領先時交換后，落後時保留后製造永將。"] },
  { icon: "♗", title: "同色象殘局", text: "把兵放在與自己象相反顏色的格子，讓象保有活動線。", fen: "8/5pk1/4b1p1/7p/3B3P/6P1/5PK1/8 w - - 0 1", steps: ["用象攻擊對手兵，同時保護自己的弱兵。", "自己的兵盡量放在與象相反顏色的格子。", "王先侵入對方兵鏈，再創造遠方通路兵。"] },
  { icon: "♝", title: "異色象殘局", text: "防守方可建立堡壘；進攻方需要第二個弱點或通路兵。", fen: "8/5pk1/6p1/2b4p/3B3P/6P1/5PK1/8 w - - 0 1", steps: ["防守方用象封鎖與自己象同色的入口格。", "進攻方不要急著換兵，要在兩翼製造弱點。", "只有一側兵時常可守和，先判斷是否需要轉換計畫。"] },
  { icon: "♘", title: "馬兵殘局", text: "固定對手兵後再封鎖；邊兵會降低馬的轉換速度。", fen: "8/5pk1/4n1p1/7p/3N3P/6P1/5PK1/8 w - - 0 1", steps: ["先把對手兵固定在馬可以攻擊的顏色。", "馬站在兵前方封鎖，王從另一側侵入。", "避免把馬困在邊線；每一步都要保留回中心的格子。"] },
  { icon: "♔", title: "王兵殘局", text: "計算對王、關鍵格與兵競速，王的每一步通常都不能浪費。", fen: "8/5pk1/6p1/7p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先數清楚雙方兵升變需要幾步。", "用對王迫使對手讓出關鍵格。", "推兵前確認不會失去對王；能先走王通常先走王。"] },
];

const mateLessons = [
  { icon: "♕", title: "后王將殺", subtitle: "一步將殺", fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1", goal: "白方走 Qg7#。后貼近對王，自己的王同時封住逃生格。" },
  { icon: "♖", title: "車王將殺", subtitle: "一步將殺", fen: "7k/5K2/8/8/8/8/8/R7 w - - 0 1", goal: "白方走 Rh1#。車切斷最後一排，王負責封住相鄰格。" },
  { icon: "♘♗", title: "馬象協力將殺", subtitle: "逼王入同色角", fen: "kB6/8/2K1N3/8/8/8/8/8 w - - 0 1", goal: "用馬控制跳格、主教封住同色斜線，逐步壓縮黑王；可展開 Stockfish 比較你的每一步。" },
];

const passedPawnLessons = [
  {
    icon: "♙♙♙",
    title: "三兵突破",
    subtitle: "三兵對三兵的經典突破",
    fen: "8/ppp5/8/PPP5/8/8/8/4K2k w - - 0 1",
    plan: ["先走中間兵 b6!，逼黑方的 a 兵或 c 兵吃向中間。", "若 ...axb6，走 c6，讓 c 兵成為通路兵；若 ...cxb6，則走 a6。", "不要先走邊兵，否則對手可以保持完整兵鏈並封鎖突破。"],
  },
  {
    icon: "♙♙",
    title: "二兵互換突破",
    subtitle: "用交換製造外側通路兵",
    fen: "8/8/pp6/8/PP6/8/8/4K2k w - - 0 1",
    plan: ["先找能迫使對方兵離開原線的交換。", "走 b5!；若 ...axb5，a 兵推進後就不再有同線敵兵阻擋。", "形成通路兵後，王要從另一側牽制對手王，避免只顧著連續推兵。"],
  },
  {
    icon: "♙♙♙",
    title: "三對二兵多數",
    subtitle: "王翼多一兵的標準製造法",
    fen: "8/6k1/6pp/8/5PPP/8/6K1/8 w - - 0 1",
    plan: ["先固定對手兵，再用三兵保持彼此保護，不要讓最前面的兵孤立。", "通常以 g5 或 h5 製造交換，留下另一條線的兵成為通路兵。", "王先靠近突破區；沒有王支援時，三對二也可能被完全封鎖。"],
  },
  {
    icon: "♙　♙",
    title: "遠方通路兵",
    subtitle: "在一翼製造兵，從另一翼入侵",
    fen: "8/p4pk1/6p1/7p/P6P/6P1/5PK1/8 w - - 0 1",
    plan: ["先判斷哪一翼能製造離雙王最遠的通路兵。", "遠方通路兵的目的不一定是升變，而是把對手王引離主要兵群。", "對手王離開後，自己的王立即吃掉另一翼弱兵，再回頭支援升變。"],
  },
];

const tacticLessons = [
  { group: "戰術", icon: "⚡", title: "閃將／發現攻擊", cue: "移開擋在車、象或后前面的棋子，讓後方長程棋子突然攻擊；若露出的線直接攻王，就是閃將。", steps: ["先找與敵王或高價棋子同一直線的長程子。", "檢查中間的己方棋子移開時，能否同時製造第二個威脅。", "優先計算將軍、吃子與雙重攻擊。"], exampleFen: "4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1", example: "例如：白象從 e2 移開，e1 白車立刻沿 e 線對黑王形成發現將軍。" },
  { group: "戰術", icon: "📌", title: "牽制（Pin）", cue: "被牽制的棋子一移動，就會暴露後方更重要的王、后或車。王後方是絕對牽制，其餘是相對牽制。", steps: ["辨認被牽制棋子後方的目標。", "用兵或較低價棋子增加攻擊者。", "先防對手解除牽制，再決定是否吃掉。"], exampleFen: "4k3/4n3/8/8/8/8/8/4R1K1 b - - 0 1", example: "例如：e7 黑馬擋在 e1 白車與 e8 黑王之間，黑馬不能隨意離開 e 線。" },
  { group: "戰術", icon: "⑂", title: "雙攻／叉攻", cue: "一手同時攻擊兩個目標；馬叉最常見，但兵、后與將軍也能形成雙攻。", steps: ["掃描所有帶將軍的落點。", "再找能同時攻擊后、車或無防守棋子的格子。", "確認落點不會被免費吃掉。"], exampleFen: "r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1", example: "例如：白馬走 Nc7+，一面將軍、一面攻擊 a8 黑車，黑王回應後白馬再吃車。" },
  { group: "戰術", icon: "↠", title: "串擊（Skewer）", cue: "先攻擊前方高價棋子，逼它移開後再吃後方目標，可視為反方向的牽制。", steps: ["沿直線尋找兩枚重疊的敵子。", "用車、象或后攻擊價值較高的前方棋子。", "預先確認前方棋子移開後能安全取得後方目標。"], exampleFen: "q7/k7/8/8/8/8/8/R5K1 b - - 0 1", example: "例如：白車沿 a 線先攻黑王；黑王離開後，後方 a8 的黑后就會被白車吃掉。" },
  { group: "戰術", icon: "✂", title: "消除防守者／引離", cue: "交換、吃掉或誘開唯一的防守棋子，使原本安全的目標失去保護。", steps: ["點算目標的攻擊者與防守者。", "找出唯一或過載的防守者。", "先用交換、犧牲或威脅把它引離。"], exampleFen: "6k1/5ppp/8/8/2B5/8/8/3Q2K1 w - - 0 1", example: "例如：先找出守住 h7 的唯一棋子，用交換或威脅引離它，再對失去保護的王翼下手。" },
  { group: "技巧", icon: "♞", title: "扇形關馬", cue: "用相連兵形成扇形，逐格奪走敵馬的退路；重點是限制，而不是急著追趕。", steps: ["先標出馬目前最多八個可達格。", "以兵控制其中兩至三個關鍵退路。", "最後才用棋子攻馬，避免推兵留下永久弱格。"], exampleFen: "6k1/8/8/2p1p3/3n4/2P1P3/3P4/6K1 w - - 0 1", example: "例如：用 c3、d2、e3 三兵形成扇形，先控制黑馬的 b4、c5、e5、f4 退路。" },
  { group: "技巧", icon: "♗", title: "分辨好象／壞象", cue: "被己方同色兵鏈限制的是壞象；能在兵鏈外活動、攻擊對手弱格的是好象。", steps: ["查看己方多數兵落在哪一種顏色。", "壞象要移到兵鏈外、準備兵突破，或交換對手好象。", "好象通常應保留，尤其雙翼都有兵時。"], exampleFen: "6k1/8/8/2p1p3/2P1P3/3B4/8/6K1 w - - 0 1", example: "例如：白兵站在深色格時，深色象容易被自己的兵鏈堵住；應想辦法走到兵鏈外。" },
  { group: "技巧", icon: "⬡", title: "建立馬前哨站", cue: "前哨站是不會被敵兵驅逐、且有己兵保護的深入格；封閉局面中特別強。", steps: ["尋找對手兵無法攻擊的中心或敵陣格。", "先交換能控制該格的輕子。", "用兵或另一枚棋子保護進駐的馬。"], exampleFen: "6k1/8/3p4/3N4/2P1P3/8/8/6K1 w - - 0 1", example: "例如：d5 白馬受 c4、e4 兵保護，且黑方沒有 c、e 兵能把它趕走，這就是前哨站。" },
  { group: "技巧", icon: "♜", title: "佔領開放線", cue: "沒有兵的直線是開放線，只有一方兵的則是半開放線；車應在此進入第七橫線或攻擊落後兵。", steps: ["先把車放到開放或半開放線。", "雙車疊起前先確認前車有安全入侵格。", "若沒有入侵點，就沿線鎖定落後兵。"], exampleFen: "6k1/3r4/8/8/8/8/8/3R2K1 w - - 0 1", example: "例如：d 線沒有兵，雙方車都應爭奪 d 線；先控制第七橫線通常能攻擊更多兵。" },
];

function ConceptExplorer() {
  const [selectedEndgame, setSelectedEndgame] = useState(endgameLessons[0]);
  const [selectedMate, setSelectedMate] = useState(mateLessons[0]);
  const [selectedPassedPawn, setSelectedPassedPawn] = useState(passedPawnLessons[0]);
  const [selectedTactic, setSelectedTactic] = useState(tacticLessons[0]);
  const [activePhase, setActivePhase] = useState<"opening" | "middlegame" | "endgame" | "passed-pawn" | "checkmate" | "tactics">("opening");
  const phases = [
    { id: "opening" as const, roman: "Ⅰ", eyebrow: "OPENING", title: "開局下法", text: "控制中心、發展輕子、完成王的安全。不要為了吃兵而讓同一枚棋子重複移動。" },
    { id: "middlegame" as const, roman: "Ⅱ", eyebrow: "MIDDLEGAME", title: "中局下法", text: "先找兵突破與弱格，再改善最差的棋子。準備兩個以上攻擊子力後才正式動手。" },
    { id: "endgame" as const, roman: "Ⅲ", eyebrow: "ENDGAME", title: "殘局下法", text: "王走向中心、製造通路兵，並依剩餘子力改變計畫；不同殘局不能使用同一套口訣。" },
    { id: "passed-pawn" as const, roman: "Ⅳ", eyebrow: "PASSED PAWN", title: "創造通路兵", text: "用兵多數、交換與突破，清除同一路線上的敵兵，再讓王護送通路兵前進。" },
    { id: "checkmate" as const, roman: "Ⅴ", eyebrow: "CHECKMATE", title: "基礎將殺", text: "用后、車或馬象協力限制逃生格，逐步縮小敵王活動範圍並完成將殺。" },
    { id: "tactics" as const, roman: "Ⅵ", eyebrow: "TACTICS & TECHNIQUE", title: "基本戰術／技巧", text: "辨識閃將、牽制與雙攻，也練習扇形關馬、好壞象和改善棋子。" },
  ];
  return <section className="concept-explorer"><div className="concept-heading"><p className="eyebrow">CHESS THINKING</p><h2>中心思想</h2><p>不是只背開局名稱，而是知道每個階段該控制什麼、交換什麼，以及何時讓王加入戰鬥。</p></div>
    <div className="concept-phase-grid" role="tablist" aria-label="選擇學習階段">{phases.map((phase) => <button type="button" role="tab" aria-selected={activePhase === phase.id} className={activePhase === phase.id ? "active" : ""} key={phase.id} onClick={() => setActivePhase(phase.id)}><span>{phase.roman}</span><div><small>{phase.eyebrow}</small><h3>{phase.title}</h3></div><p>{phase.text}</p></button>)}</div>
    {activePhase === "opening" && <section className="opening-checklist phase-content"><div className="section-heading"><div><p className="eyebrow">OPENING CHECKLIST</p><h3>開局三個問題與具體解法</h3></div><small>每走一步依序檢查</small></div><div>
      <article><span>1</span><h4>控制中心</h4><ol><li><b>解決辦法 1：</b>用 e、d 兵佔領或攻擊 e4、d4、e5、d5。</li><li><b>解決辦法 2：</b>用馬放在 f3／c3（黑方 f6／c6）增加中心控制。</li><li><b>檢查：</b>對手若立刻推中心兵，我能交換、封鎖還是反擊？</li></ol></article>
      <article><span>2</span><h4>發展輕子</h4><ol><li><b>解決辦法 1：</b>先發展有自然好格的馬，避免同一枚棋子重複走。</li><li><b>解決辦法 2：</b>依兵形決定主教放 c4、b5、e2 或 g2，而不是只求出子。</li><li><b>檢查：</b>這步是否增加中心壓力，並為易位騰出位置？</li></ol></article>
      <article><span>3</span><h4>完成王的安全</h4><ol><li><b>解決辦法 1：</b>清空王與車之間的棋子，通常在第 6–10 手完成易位。</li><li><b>解決辦法 2：</b>對手中心尚未打開前，不要無理由推動王前方兵。</li><li><b>檢查：</b>中心若下一手打開，我的王會不會留在中線受攻？</li></ol></article>
    </div></section>}
    {activePhase === "middlegame" && <section className="opening-checklist middlegame-checklist phase-content"><div className="section-heading"><div><p className="eyebrow">MIDDLEGAME CHECKLIST</p><h3>中局三個問題與具體解法</h3></div><small>先評估，再動手</small></div><div>
      <article><span>1</span><h4>最差的棋子是哪一枚？</h4><ol><li><b>解決辦法 1：</b>把沒有活動線的馬、象或車移到能攻擊弱點的位置。</li><li><b>解決辦法 2：</b>若沒有直接戰術，優先改善最差棋子而不是無目的推兵。</li><li><b>檢查：</b>換位後它是否多控制格子、支援突破或保護王？</li></ol></article>
      <article><span>2</span><h4>突破點與目標在哪裡？</h4><ol><li><b>解決辦法 1：</b>找落後兵、孤兵、弱格與沒有兵保護的棋子。</li><li><b>解決辦法 2：</b>用 c、d、e、f 兵突破打開適合己方子力的線。</li><li><b>檢查：</b>突破後先打開的是我的車象，還是對手的子力？</li></ol></article>
      <article><span>3</span><h4>可以正式進攻了嗎？</h4><ol><li><b>解決辦法 1：</b>至少讓兩枚棋子共同攻擊同一弱點，再加入后或車。</li><li><b>解決辦法 2：</b>先計算對手的強制回應：將軍、吃子與直接威脅。</li><li><b>檢查：</b>攻擊若被擋住，我是否仍能安全撤回並維持局面？</li></ol></article>
    </div></section>}
    {activePhase === "passed-pawn" && <section className="passed-pawn-library phase-content"><div className="section-heading"><div><p className="eyebrow">4 · PASSED PAWN LAB</p><h3>創造通路兵棋盤練習</h3></div><small>從常見兵形練習突破、交換與王的支援</small></div>
      <div className="passed-pawn-practice-layout"><div className="passed-pawn-lesson-list">{passedPawnLessons.map((lesson) => <button className={selectedPassedPawn.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedPassedPawn(lesson)}><span>{lesson.icon}</span><div><b>{lesson.title}</b><small>{lesson.subtitle}</small></div></button>)}</div>
        <article className="passed-pawn-board-card"><header><div><p className="eyebrow">PLAYABLE POSITION</p><h3>{selectedPassedPawn.title}</h3></div><span>{sideLabelFromFen(selectedPassedPawn.fen)}走</span></header><Chessboard key={`${selectedPassedPawn.title}-${sideFromFen(selectedPassedPawn.fen)}`} line="" initialFen={selectedPassedPawn.fen} orientation={sideFromFen(selectedPassedPawn.fen)} interactive analysis /><div className="passed-pawn-plan"><b>通路兵計畫</b><ol>{selectedPassedPawn.plan.map((step) => <li key={step}>{step}</li>)}</ol></div></article>
      </div>
    </section>}
    {activePhase === "checkmate" && <section className="mate-library phase-content"><div className="section-heading"><div><p className="eyebrow">5 · CHECKMATE LAB</p><h3>基礎將殺棋盤練習</h3></div><small>選一種子力組合，在棋盤上完成將殺</small></div>
      <div className="mate-practice-layout"><div className="mate-lesson-list">{mateLessons.map((lesson) => <button className={selectedMate.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedMate(lesson)}><span>{lesson.icon}</span><div><b>{lesson.title}</b><small>{lesson.subtitle}</small></div></button>)}</div>
        <article className="mate-board-card"><header><div><p className="eyebrow">PLAYABLE POSITION</p><h3>{selectedMate.title}</h3></div><span>{sideLabelFromFen(selectedMate.fen)}走</span></header><Chessboard key={`${selectedMate.title}-${sideFromFen(selectedMate.fen)}`} line="" initialFen={selectedMate.fen} orientation={sideFromFen(selectedMate.fen)} interactive analysis /><p><b>練習目標：</b>{selectedMate.goal}</p></article>
      </div>
    </section>}
    {activePhase === "tactics" && <section className="tactics-library phase-content"><div className="section-heading"><div><p className="eyebrow">6 · TACTICS & TECHNIQUE</p><h3>基本戰術／技巧辨識</h3></div><small>先看局面特徵，再照步驟計算</small></div>
      <div className="tactics-practice-layout"><div className="tactic-groups">{["戰術", "技巧"].map((group) => <section key={group}><h4>{group === "戰術" ? "強制戰術" : "局面技巧"}</h4><div>{tacticLessons.filter((lesson) => lesson.group === group).map((lesson) => <button type="button" className={selectedTactic.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedTactic(lesson)}><span>{lesson.icon}</span><b>{lesson.title}</b></button>)}</div></section>)}</div>
        <article className="tactic-detail"><header><span>{selectedTactic.icon}</span><div><p className="eyebrow">{selectedTactic.group}</p><h3>{selectedTactic.title}</h3></div></header><p>{selectedTactic.cue}</p><div className="tactic-example"><div><p className="eyebrow">EXAMPLE POSITION</p><h4>局面範例</h4><p>{selectedTactic.example}</p></div><Chessboard key={selectedTactic.title} line="" initialFen={selectedTactic.exampleFen} compact /></div><h4>實戰辨識步驟</h4><ol>{selectedTactic.steps.map((step) => <li key={step}>{step}</li>)}</ol><aside><b>每回合先問：</b>我有將軍、吃子或直接威脅嗎？對手下一手又有什麼強制手段？</aside></article>
      </div>
    </section>}
    {activePhase === "endgame" && <div className="endgame-library phase-content"><div className="section-heading"><div><p className="eyebrow">ENDGAME LIBRARY</p><h3>不同殘局下法</h3></div><small>點選後開啟棋盤與 Stockfish</small></div><div>{endgameLessons.map((lesson) => <button className={selectedEndgame.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedEndgame(lesson)}><span>{lesson.icon}</span><h4>{lesson.title}</h4><p>{lesson.text}</p></button>)}</div>
      <section className="endgame-lab"><div className="endgame-board"><Chessboard key={selectedEndgame.title} line="" initialFen={selectedEndgame.fen} interactive analysis /></div><aside><p className="eyebrow">PRACTICE POSITION</p><h3>{selectedEndgame.title}怎麼下</h3><ol>{selectedEndgame.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>你可以自由走棋；綠框是 Stockfish 建議，按「←」可撤回上一步。</p></aside></section>
    </div>}
  </section>;
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
    <div className="book-next"><h4>可以怎麼下，會變成什麼開局</h4>{recognition.suggestions.length ? <div>{recognition.suggestions.map((suggestion) => <article key={suggestion.move}><strong className={side === "白方" ? "white" : "black"}><i aria-hidden="true">{bookMovePiece(suggestion.move, side)}</i><span>{suggestion.move}</span></strong><span>→</span><p>{suggestion.targets.slice(0, 3).map((opening) => opening.title_zh).join("／")}{suggestion.targets.length > 3 ? ` 等 ${suggestion.targets.length} 種` : ""}</p></article>)}</div> : <p>{position.moves.length ? "目前已離開已收錄的固定棋路；可參考棋盤下方 Stockfish 的局面建議。" : "走棋後會列出可轉入的開局與變例。"}</p>}</div>
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

function OpponentExplorer({ data }: { data: OpeningMapData }) {
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
      <button className={matchMode === "normal" ? "active" : ""} onClick={() => { setMatchMode("normal"); setBlindStockfish(false); setGame((value) => value + 1); }}><span>♟</span><div><small>建立對局</small><b>一般對局</b><p>完整棋盤，原本的對手練習功能。</p></div></button>
      <button className={matchMode === "blind" ? "active blind" : ""} onClick={() => { setMatchMode("blind"); setBlindStockfish(false); setGame((value) => value + 1); }}><span>◌</span><div><small>建立對局</small><b>盲棋對局</b><p>棋子隱藏，只保留對手最後一步的橘色框。</p></div><i>Live Board<br />預設折疊</i></button>
    </div>
    <div className="practice-identity"><label><span>我的名字</span><input value={playerName} onChange={(event) => setPlayerName(event.target.value)} /></label><label><span>對手名字</span><input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} /></label><label className="chesscom-account"><span>Chess.com 帳號連結</span><div><input value={chessComAccount} onChange={(event) => setChessComAccount(event.target.value)} placeholder="使用者名稱或個人頁網址" />{profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" aria-label="開啟 Chess.com 個人頁">開啟 ↗</a>}</div></label><fieldset><legend>我執哪一方</legend><button className={playerColor === "white" ? "active" : ""} onClick={() => chooseColor("white")}>♙ 白方</button><button className={playerColor === "black" ? "active" : ""} onClick={() => chooseColor("black")}>♟ 黑方</button></fieldset></div>
    <div className="opponent-layout"><div className="opponent-levels">{opponentLevels.map((item) => <button className={level === item.value ? "active" : ""} key={item.value} onClick={() => chooseLevel(item)}><span>{item.value}</span><div><b>{item.name} · {item.opponent}</b><small>{item.rating}</small><p>{item.text}</p></div></button>)}<OpeningRecognition data={data} position={position} /></div>
      <div className="opponent-board-column"><div className={`opponent-board ${matchMode === "blind" ? "blind-game" : ""}`}><header><div><small>{matchMode === "blind" ? "盲棋對手" : "目前對手"}</small><h3>{opponentName}</h3></div><span>你執{playerColor === "white" ? "白" : "黑"}</span></header><p className={`turn-status ${waitingForOpponent ? "waiting" : "your-turn"}`}>{waitingForOpponent ? `${nextColor === "white" ? "白方" : "黑方"}正在走棋…` : `輪到你（${playerColor === "white" ? "白方" : "黑方"}）`}</p>{matchMode === "blind" && <div className="blind-intro"><span>棋子已隱藏；可用「盤點位置」確認記憶。</span><button onClick={() => setBlindStockfish((value) => !value)}>{blindStockfish ? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"}</button></div>}<Chessboard key={`${matchMode}-${level}-${playerColor}-${game}`} line="" interactive analysis={matchMode === "normal" || blindStockfish} opponentLevel={level} playerColor={playerColor} orientation={playerColor} blind={matchMode === "blind"} onPositionChange={setPosition} />{matchMode === "blind" && position.fen && <details className="blind-live-board"><summary><span>LIVE BOARD</span><b>查看棋子位置</b><i>預設折疊</i></summary><div><Chessboard key={`live-${position.fen}`} line="" initialFen={position.fen} compact orientation={playerColor} /></div></details>}<div className="player-seats"><span className="white"><i>♔</i><small>白方</small><b>{whiteName}</b></span><span className="black"><i>♚</i><small>黑方</small><b>{blackName}</b></span></div></div></div></div>
  </section>;
}

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

function PuzzleExplorer() {
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

function SearchResults({ nodes, query, onSelect }: { nodes: Opening[]; query: string; onSelect: (id: string) => void }) {
  return <section className="search-results"><p className="eyebrow">SEARCH RESULTS</p><h2>「{query}」找到 {nodes.length} 個開局</h2>{nodes.length ? <div className="opening-card-grid search-card-grid">{nodes.map((node) => <OpeningCard key={node.id} node={node} preview onClick={() => onSelect(node.id)} />)}</div> : <Empty />}</section>;
}

function OpeningCard({ node, selected, preview = false, onClick }: { node: Opening; selected?: boolean; preview?: boolean; onClick: () => void }) {
  return <button className={`opening-card ${preview ? "has-preview" : ""} ${selected ? "selected" : ""}`} onClick={onClick}><span>{node.eco}</span><b>{openingIcon(node.title_zh, node.title_en) && <i className="opening-origin-icon" aria-hidden="true">{openingIcon(node.title_zh, node.title_en)}</i>}{node.title_zh}</b><small>{node.title_en}</small>{preview && <OpeningPositionPreview opening={node} />}<em>{node.side} · {node.category}</em></button>;
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

function FenPositionPreview({ fen, label }: { fen: string; label: string }) {
  const position = useMemo(() => new Chess(fen).board().flatMap((row) => row), [fen]);
  const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;
  return <span className="opening-position-preview transposition-position" aria-label={label}><span className="preview-board cg-wrap" aria-hidden="true">{position.map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? "dark" : "light"} key={index}>{piece && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}` })}</span>)}</span><i>{label}</i></span>;
}

function MapBoardPreview({ opening, line, step, fromStep, level, label, onBestMove }: { opening: Opening; line?: string; step: number; fromStep: number; level: string; label: string; onBestMove?: (san: string | null) => void }) {
  const frameRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(() => {
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    return shouldStartLiveBoardMinimized(viewportWidth);
  });
  const [position, setPosition] = useState(() => {
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const width = Math.min(430, viewportWidth - 16);
    return { x: Math.max(8, (viewportWidth - width) / 2), y: 12 };
  });

  function keepOnScreen(x: number, y: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 430; const height = rect?.height ?? 480;
    return { x: Math.max(8, Math.min(window.innerWidth - width - 8, x)), y: Math.max(8, Math.min(window.innerHeight - height - 8, y)) };
  }

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const clamp = () => setPosition((current) => keepOnScreen(current.x, current.y));
    const observer = new ResizeObserver(clamp);
    observer.observe(frame);
    window.addEventListener("resize", clamp);
    return () => { observer.disconnect(); window.removeEventListener("resize", clamp); };
  }, []);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setDragging(true);
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    setPosition(keepOnScreen(event.clientX - dragRef.current.offsetX, event.clientY - dragRef.current.offsetY));
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null; setDragging(false);
  }

  return <aside ref={frameRef} className={`map-board-preview resizable ${dragging ? "dragging" : ""} ${minimized ? "minimized" : ""}`} style={{ left: position.x, top: position.y }} aria-live="polite">
    <div className="floating-board-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div><p className="eyebrow">LIVE BOARD</p><h3>{level}</h3><b>{label}</b></div>
      <div className="floating-board-actions"><span>⠿ 拖曳移動</span><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "還原 Live Board" : "最小化 Live Board"}>{minimized ? "□" : "−"}</button></div>
    </div>
    {!minimized && <><Chessboard key={`${opening.id}-${line ?? "main"}-${fromStep}-${step}`} line={line ?? opening.mainline} initialStep={step} interactive analysis showControls autoPlay autoPlayFromStep={fromStep} orientation={opening.side === "黑方" ? "black" : "white"} onBestMove={onBestMove} />
      <details className="floating-key-moves"><summary>重要招法 <span>{lineMoves(line ?? opening.mainline).length} 手</span></summary><div>{lineMoves(line ?? opening.mainline).map((move, index) => <span className={index % 2 === 0 ? "white-move" : "black-move"} key={`${move}-${index}`}>{move}</span>)}</div></details>
      <small>{opening.title_zh} · {opening.eco}</small>
      <span className="resize-hint" aria-hidden="true">↘</span></>}
  </aside>;
}

function Level({ title, intro, step, children }: { title: string; intro: string; step: string; children: React.ReactNode }) {
  return <div className="level"><div className="level-heading"><div><p className="eyebrow">{step}</p><h2>{title}</h2><p>{intro}</p></div></div>{children}</div>;
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return <nav className="breadcrumb" aria-label="目前位置">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <i>›</i>}{item.onClick ? <button onClick={item.onClick}>{item.label}</button> : <b>{item.label}</b>}</span>)}</nav>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
function moveName(move: string) { return ({ e4: "王兵起手", d4: "后兵起手", c4: "英式起手", Nf3: "列蒂起手", 其他: "不規則起手" } as Record<string, string>)[move] ?? move; }
function lineMoves(line: string) { return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)); }
