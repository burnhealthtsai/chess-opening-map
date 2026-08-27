import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClassificationOverview, FamilyOpeningTree } from "./ClassificationMap";
import { openingIcon } from "./openingIcon";
import { readStoredBoolean, readStoredChoice, writeStoredPreference } from "./preferences";
import { shouldStartLiveBoardMinimized } from "./responsive";
import type { DetailedOpening, Opening, OpeningDetailsData, OpeningExplorerData, OpeningMapData, OpeningVariationNotesData, RelationMode } from "./types";

const openingDetailModule = () => import("./OpeningDetail");
const OpeningDetail = lazy(openingDetailModule);
const PuzzleExplorer = lazy(() => import("./PuzzleExplorer"));
const ConceptExplorer = lazy(() => import("./ConceptExplorer"));
const OpponentExplorer = lazy(() => import("./OpponentExplorer"));
const StyleExplorer = lazy(() => import("./StyleExplorer"));
const TranspositionExplorer = lazy(() => import("./TranspositionExplorer"));
const AnalogyExplorer = lazy(() => import("./AnalogyExplorer"));
const OpeningPositionPreview = lazy(() => import("./OpeningPositionPreview"));
const chessboardModule = () => import("./Chessboard");
const Chessboard = lazy(() => chessboardModule().then((module) => ({ default: module.Chessboard })));
const pieceThemeModule = () => import("./pieceThemes");
const openingSchemaVersion = 9;

function prepareChessSound() {
  void chessboardModule().then((module) => module.prepareChessSound()).catch(() => undefined);
}

let openingDetailsRequest: Promise<OpeningDetailsData> | null = null;
function loadOpeningDetails() {
  if (!openingDetailsRequest) {
    openingDetailsRequest = fetch("./opening-details.json")
      .then((response) => response.ok ? response.json() as Promise<OpeningDetailsData> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .catch((error) => { openingDetailsRequest = null; throw error; });
  }
  return openingDetailsRequest;
}

let openingExplorerRequest: Promise<OpeningExplorerData> | null = null;
function loadOpeningExplorerData() {
  if (!openingExplorerRequest) {
    openingExplorerRequest = fetch("./opening-explorers.json")
      .then((response) => response.ok ? response.json() as Promise<OpeningExplorerData> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .catch((error) => { openingExplorerRequest = null; throw error; });
  }
  return openingExplorerRequest;
}

let openingVariationNotesRequest: Promise<OpeningVariationNotesData> | null = null;
function loadOpeningVariationNotes() {
  if (!openingVariationNotesRequest) {
    openingVariationNotesRequest = fetch("./opening-variation-notes.json")
      .then((response) => response.ok ? response.json() as Promise<OpeningVariationNotesData> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .catch((error) => { openingVariationNotesRequest = null; throw error; });
  }
  return openingVariationNotesRequest;
}

type Lens = "family" | "concept" | "opponent" | "puzzles" | "style" | "transpositions" | "analogies";
const all = "全部";
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
type PieceStyle = (typeof pieceStyles)[number][0];
type BoardStyle = (typeof boardStyles)[number][0];
const pieceStyleValues = pieceStyles.map(([value]) => value);
const boardStyleValues = boardStyles.map(([value]) => value);
export function App() {
  const [data, setData] = useState<OpeningMapData | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapRetry, setMapRetry] = useState(0);
  const [lens, setLens] = useState<Lens>("family");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(all);
  const [styleSide, setStyleSide] = useState(all);
  const [selectedSide, setSelectedSide] = useState<Opening["side"]>("白方");
  const [selectedFirstMove, setSelectedFirstMove] = useState<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openingDetails, setOpeningDetails] = useState<OpeningDetailsData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [explorerData, setExplorerData] = useState<OpeningExplorerData | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerRetry, setExplorerRetry] = useState(0);
  const [variationNotes, setVariationNotes] = useState<OpeningVariationNotesData | null>(null);
  const [variationNotesRequested, setVariationNotesRequested] = useState(false);
  const [variationNoteError, setVariationNoteError] = useState<string | null>(null);
  const [variationNoteRetry, setVariationNoteRetry] = useState(0);
  const [dark, setDark] = useState(() => readStoredBoolean("dark", false));
  const [pieceStyle, setPieceStyle] = useState<PieceStyle>(() => readStoredChoice("piece-style", pieceStyleValues, "original"));
  const [boardStyle, setBoardStyle] = useState<BoardStyle>(() => readStoredChoice("board-style", boardStyleValues, "wood"));

  useEffect(() => {
    let active = true;
    setMapError(null);
    fetch("./opening-map.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = await response.json() as OpeningMapData;
        if (next.schema_version !== openingSchemaVersion
          || typeof next.generated_at !== "string"
          || !Array.isArray(next.nodes)
          || !next.nodes.length
          || !next.navigation) throw new Error("Invalid opening catalog");
        if (active) setData(next);
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setMapError("開局地圖載入失敗，請檢查網路後重試。");
      });
    return () => { active = false; };
  }, [mapRetry]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1828" : "#f4f8fc");
    writeStoredPreference("dark", dark);
  }, [dark]);
  useEffect(() => {
    document.documentElement.dataset.pieceStyle = pieceStyle;
    writeStoredPreference("piece-style", pieceStyle);
    if (pieceStyle === "original") {
      document.querySelector("style[data-generated-piece-theme]")?.remove();
      return;
    }
    let active = true;
    pieceThemeModule().then(({ installPieceTheme }) => {
      if (active && document.documentElement.dataset.pieceStyle === pieceStyle) installPieceTheme(pieceStyle);
    }).catch(() => { if (active) setPieceStyle("original"); });
    return () => { active = false; };
  }, [pieceStyle]);
  useEffect(() => {
    document.documentElement.dataset.boardStyle = boardStyle;
    writeStoredPreference("board-style", boardStyle);
  }, [boardStyle]);

  useEffect(() => {
    if (!selectedId || openingDetails || !data) return;
    let active = true;
    setDetailError(null);
    loadOpeningDetails().then((details) => {
      if (details.schema_version !== data.schema_version || details.generated_at !== data.generated_at) {
        openingDetailsRequest = null;
        throw new Error("開局地圖與詳情資料版本不一致");
      }
      if (active) setOpeningDetails(details);
    }).catch(() => { if (active) setDetailError("開局詳情載入失敗，請重新載入。"); });
    return () => { active = false; };
  }, [data, detailRetry, openingDetails, selectedId]);

  useEffect(() => {
    if (!data || explorerData || !["transpositions", "analogies"].includes(lens)) return;
    let active = true;
    setExplorerError(null);
    loadOpeningExplorerData().then((explorers) => {
      if (explorers.schema_version !== data.schema_version || explorers.generated_at !== data.generated_at) {
        openingExplorerRequest = null;
        throw new Error("開局地圖與分頁資料版本不一致");
      }
      if (active) setExplorerData(explorers);
    }).catch(() => { if (active) setExplorerError("分頁資料載入失敗，請重新載入。"); });
    return () => { active = false; };
  }, [data, explorerData, explorerRetry, lens]);

  useEffect(() => {
    if (!data || variationNotes || !variationNotesRequested) return;
    let active = true;
    setVariationNoteError(null);
    loadOpeningVariationNotes().then((notes) => {
      if (notes.schema_version !== data.schema_version || notes.generated_at !== data.generated_at || notes.notes.length !== data.nodes.length) {
        openingVariationNotesRequest = null;
        throw new Error("開局地圖與變例解說版本不一致");
      }
      if (active) setVariationNotes(notes);
    }).catch(() => { if (active) setVariationNoteError("變例解說載入失敗。"); });
    return () => { active = false; };
  }, [data, variationNoteRetry, variationNotes, variationNotesRequested]);

  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;
  const detailedSelected = useMemo<DetailedOpening | null>(() => {
    const details = selected && openingDetails?.openings[selected.id];
    return selected && details ? { ...selected, ...details } : null;
  }, [openingDetails, selected]);
  const selectedIndex = selected && data ? data.nodes.findIndex((opening) => opening.id === selected.id) : -1;
  const selectedVariationNotes = selectedIndex >= 0 ? variationNotes?.notes[selectedIndex] ?? null : null;
  const relationMode: RelationMode = lens === "family" ? "family" : "style";
  const neighbours = useMemo(() => {
    if (!selected || !data || !openingDetails) return [] as Opening[];
    const ranked = openingDetails.edges[relationMode]
      .filter((edge) => edge.source === selected.id || edge.target === selected.id)
      .map((edge) => ({ id: edge.source === selected.id ? edge.target : edge.source, weight: edge.weight }))
      .sort((a, b) => b.weight - a.weight).slice(0, 5);
    return ranked.map(({ id }) => data.nodes.find((node) => node.id === id)!).filter(Boolean);
  }, [data, openingDetails, relationMode, selected]);
  const searchResults = useMemo(() => {
    if (!data || !query.trim()) return [];
    const needle = query.trim().toLowerCase();
    return data.nodes.filter((node) => `${node.title_zh} ${node.title_en} ${node.eco}`.toLowerCase().includes(needle)
      && (category === all || node.category === category)
      && (styleSide === all || node.side === styleSide));
  }, [category, data, query, styleSide]);

  function switchLens(next: Lens) {
    setLens(next); setSelectedId(null); setQuery("");
    if (["transpositions", "analogies"].includes(next)) void loadOpeningExplorerData().catch(() => undefined);
    if (next !== "style") setSelectedStyle(null);
  }
  function home() { setSelectedFirstMove(null); setSelectedFamily(null); setSelectedId(null); }
  function openSide(side: Opening["side"]) { setSelectedSide(side); setSelectedFirstMove(null); setSelectedFamily(null); setSelectedId(null); }
  function openFirstMove(move: string) { setSelectedFirstMove(move); setSelectedFamily(null); setSelectedId(null); }
  function openFamily(id: string) { setSelectedFamily(id); setSelectedId(null); }
  function selectOpening(id: string) {
    prepareChessSound();
    void openingDetailModule();
    void loadOpeningDetails().catch(() => undefined);
    setSelectedId(id);
  }
  function retryOpeningDetails() {
    openingDetailsRequest = null;
    setDetailError(null);
    setDetailRetry((value) => value + 1);
  }
  function retryOpeningMap() {
    setMapError(null);
    setMapRetry((value) => value + 1);
  }
  function retryExplorerData() {
    openingExplorerRequest = null;
    setExplorerError(null);
    setExplorerRetry((value) => value + 1);
  }
  function retryVariationNotes() {
    openingVariationNotesRequest = null;
    setVariationNoteError(null);
    setVariationNoteRetry((value) => value + 1);
  }
  function requestVariationNotes() { setVariationNotesRequested(true); }
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

  if (!data) return mapError
    ? <main className="catalog-load-error" role="alert"><div><span aria-hidden="true">↻</span><h1>開局地圖暫時載入失敗</h1><p>{mapError}</p><button onClick={retryOpeningMap}>重新載入地圖</button></div></main>
    : <main className="loading" role="status">正在建立清楚的開局學習路線…</main>;
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
          : lens === "concept" ? <Suspense fallback={<div className="loading-inline" role="status">正在載入中心思想…</div>}><ConceptExplorer /></Suspense>
          : lens === "opponent" ? <Suspense fallback={<div className="loading-inline" role="status">正在載入對手練習…</div>}><OpponentExplorer data={data} /></Suspense>
          : lens === "puzzles" ? <Suspense fallback={<div className="loading-inline" role="status">正在載入謎題訓練…</div>}><PuzzleExplorer /></Suspense>
          : lens === "style" ? <Suspense fallback={<div className="loading-inline" role="status">正在載入學習風格…</div>}><StyleExplorer data={data} category={category} side={styleSide} style={selectedStyle} selectedId={selectedId} onStyle={(value) => { setSelectedStyle(value); setSelectedId(null); }} onSelect={selectOpening} /></Suspense>
          : lens === "transpositions" ? explorerError ? <ExplorerLoadError message={explorerError} onRetry={retryExplorerData} /> : explorerData ? <Suspense fallback={<div className="loading-inline" role="status">正在載入體系轉換…</div>}><TranspositionExplorer nodes={data.nodes} groups={explorerData.transpositionGroups} onSelect={selectOpening} /></Suspense> : <div className="loading-inline" role="status">正在載入體系轉換資料…</div>
          : explorerError ? <ExplorerLoadError message={explorerError} onRetry={retryExplorerData} /> : explorerData ? <Suspense fallback={<div className="loading-inline" role="status">正在載入類似比較…</div>}><AnalogyExplorer nodes={data.nodes} groups={explorerData.analogyGroups} onSelect={selectOpening} /></Suspense> : <div className="loading-inline" role="status">正在載入類似比較資料…</div>}
      </section>
      {selected && <aside className={`detail open ${/歐文|Owen/i.test(`${selected.title_zh} ${selected.title_en}`) ? "opening-home-modal" : ""}`} aria-live="polite">{detailError ? <DetailLoadError message={detailError} onRetry={retryOpeningDetails} /> : detailedSelected ? <Suspense fallback={<div className="loading-inline" role="status">正在載入開局詳情…</div>}><OpeningDetail key={selected.id} opening={detailedSelected} neighbours={neighbours} variationNotes={selectedVariationNotes} variationNoteError={variationNoteError} onRequestVariationNotes={requestVariationNotes} onRetryVariationNotes={retryVariationNotes} onSelect={selectOpening} onCopy={copyLine} onClose={() => setSelectedId(null)} /></Suspense> : <div className="loading-inline" role="status">正在載入開局詳情資料…</div>}</aside>}
    </div>}
    {query.trim() && selected && <aside className="detail modal-detail" aria-live="polite">{detailError ? <DetailLoadError message={detailError} onRetry={retryOpeningDetails} /> : detailedSelected ? <Suspense fallback={<div className="loading-inline" role="status">正在載入開局詳情…</div>}><OpeningDetail key={selected.id} opening={detailedSelected} neighbours={neighbours} variationNotes={selectedVariationNotes} variationNoteError={variationNoteError} onRequestVariationNotes={requestVariationNotes} onRetryVariationNotes={retryVariationNotes} onSelect={selectOpening} onCopy={copyLine} onClose={() => setSelectedId(null)} /></Suspense> : <div className="loading-inline" role="status">正在載入開局詳情資料…</div>}</aside>}
  </main>;
}

function DetailLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="detail-load-error" role="alert"><b>{message}</b><button onClick={onRetry}>重新載入</button></div>;
}

function ExplorerLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty" role="alert"><b>{message}</b><button className="clear-button" onClick={onRetry}>重新載入</button></div>;
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

function SearchResults({ nodes, query, onSelect }: { nodes: Opening[]; query: string; onSelect: (id: string) => void }) {
  return <section className="search-results"><p className="eyebrow">SEARCH RESULTS</p><h2>「{query}」找到 {nodes.length} 個開局</h2>{nodes.length ? <div className="opening-card-grid search-card-grid">{nodes.map((node) => <OpeningCard key={node.id} node={node} preview onClick={() => onSelect(node.id)} />)}</div> : <Empty />}</section>;
}

function OpeningCard({ node, selected, preview = false, onClick }: { node: Opening; selected?: boolean; preview?: boolean; onClick: () => void }) {
  return <button className={`opening-card ${preview ? "has-preview" : ""} ${selected ? "selected" : ""}`} onClick={onClick}><span>{node.eco}</span><b>{openingIcon(node.title_zh, node.title_en) && <i className="opening-origin-icon" aria-hidden="true">{openingIcon(node.title_zh, node.title_en)}</i>}{node.title_zh}</b><small>{node.title_en}</small>{preview && <Suspense fallback={<span className="opening-position-preview preview-loading" aria-hidden="true">局面載入中…</span>}><OpeningPositionPreview opening={node} /></Suspense>}<em>{node.side} · {node.category}</em></button>;
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
    {!minimized && <><Suspense fallback={<div className="board-loading" role="status">正在載入 Live Board…</div>}><Chessboard key={`${opening.id}-${line ?? "main"}-${fromStep}-${step}`} line={line ?? opening.mainline} initialStep={step} interactive analysis deferAnalysis showControls autoPlay autoPlayFromStep={fromStep} orientation={opening.side === "黑方" ? "black" : "white"} onBestMove={onBestMove} /></Suspense>
      <details className="floating-key-moves"><summary>重要招法 <span>{lineMoves(line ?? opening.mainline).length} 手</span></summary><div>{lineMoves(line ?? opening.mainline).map((move, index) => <span className={index % 2 === 0 ? "white-move" : "black-move"} key={`${move}-${index}`}>{move}</span>)}</div></details>
      <small>{opening.title_zh} · {opening.eco}</small>
      <span className="resize-hint" aria-hidden="true">↘</span></>}
  </aside>;
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return <nav className="breadcrumb" aria-label="目前位置">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <i>›</i>}{item.onClick ? <button onClick={item.onClick}>{item.label}</button> : <b>{item.label}</b>}</span>)}</nav>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Empty() { return <div className="empty">沒有符合目前條件的開局。</div>; }
function lineMoves(line: string) { return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)); }
