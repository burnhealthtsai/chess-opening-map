import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8").catch(() => "");
const puzzles = await readFile(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const concepts = await readFile(new URL("../src/ConceptExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const opponents = await readFile(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const styles = await readFile(new URL("../src/StyleExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const transpositions = await readFile(new URL("../src/TranspositionExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const analogies = await readFile(new URL("../src/AnalogyExplorer.tsx", import.meta.url), "utf8").catch(() => "");
const globalCss = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const puzzleCss = await readFile(new URL("../src/PuzzleExplorer.css", import.meta.url), "utf8").catch(() => "");
const conceptCss = await readFile(new URL("../src/ConceptExplorer.css", import.meta.url), "utf8").catch(() => "");
const opponentCss = await readFile(new URL("../src/OpponentExplorer.css", import.meta.url), "utf8").catch(() => "");
const styleCss = await readFile(new URL("../src/StyleExplorer.css", import.meta.url), "utf8").catch(() => "");
const transpositionCss = await readFile(new URL("../src/TranspositionExplorer.css", import.meta.url), "utf8").catch(() => "");
const analogyCss = await readFile(new URL("../src/AnalogyExplorer.css", import.meta.url), "utf8").catch(() => "");
const detailCss = await readFile(new URL("../src/OpeningDetail.css", import.meta.url), "utf8").catch(() => "");
const positionPreview = await readFile(new URL("../src/OpeningPositionPreview.tsx", import.meta.url), "utf8").catch(() => "");

test("opening details and knowledge load only after an opening is selected", () => {
  assert.match(app, /const openingDetailModule = \(\) => import\("\.\/OpeningDetail"\)/);
  assert.match(app, /const OpeningDetail = lazy\(openingDetailModule\)/);
  assert.match(app, /<Suspense fallback=/);
  assert.doesNotMatch(app, /from "\.\/openingKnowledge"/);
  assert.match(detail, /export default function OpeningDetail/);
  assert.match(detail, /from "\.\/openingKnowledge"/);
  assert.match(app, /fetch\("\.\/opening-details\.json"\)/);
  assert.match(app, /function selectOpening\(id: string\).*loadOpeningDetails\(\)/s);
  assert.doesNotMatch(app, /useEffect\(\(\) => \{\s*fetch\("\.\/opening-details\.json"\)/);
  assert.match(app, /fetch\("\.\/opening-variation-notes\.json"\)/);
  assert.match(app, /if \(!data \|\| variationNotes \|\| !variationNotesRequested\) return/);
  assert.match(detail, /onClick=\{\(\) => \{ setActiveLine\(index\); onRequestVariationNotes\(\); \}\}/);
  assert.match(detail, /正在載入變例解說/);
});

test("custom piece theme generation loads only after leaving the original set", () => {
  assert.doesNotMatch(app, /import \{ installPieceTheme \} from "\.\/pieceThemes"/);
  assert.match(app, /const pieceThemeModule = \(\) => import\("\.\/pieceThemes"\)/);
  assert.match(app, /if \(pieceStyle === "original"\).*generated-piece-theme.*remove\(\)/s);
  assert.match(app, /pieceThemeModule\(\)\.then\(\(\{ installPieceTheme \}\)/);
  assert.match(app, /pieceThemeModule\(\).*\.catch\(\(\) => \{ if \(active\) setPieceStyle\("original"\); \}\)/s);
  assert.doesNotMatch(globalCss, /data-piece-style/);
  assert.doesNotMatch(globalCss, /CSS-built ornaments|retired CSS ornament/);
  assert.match(app, /readStoredChoice\("piece-style"/);
  assert.match(app, /readStoredChoice\("board-style"/);
  assert.match(app, /readStoredBoolean\("dark", false\)/);
  assert.match(app, /writeStoredPreference\("piece-style", pieceStyle\)/);
  assert.match(app, /meta\[name="theme-color"\].*dark \? "#0f1828" : "#f4f8fc"/s);
});

test("chess rules and the full board stay out of the initial application chunk", () => {
  assert.doesNotMatch(app, /import \{ Chess \} from "chess\.js"/);
  assert.doesNotMatch(app, /import \{ Chessboard, prepareChessSound \} from "\.\/Chessboard"/);
  assert.match(app, /const chessboardModule = \(\) => import\("\.\/Chessboard"\)/);
  assert.match(app, /const Chessboard = lazy\(\(\) => chessboardModule\(\)\.then/);
  assert.match(app, /const OpeningPositionPreview = lazy\(\(\) => import\("\.\/OpeningPositionPreview"\)\)/);
  assert.match(positionPreview, /import \{ Chess \} from "chess\.js"/);
  assert.match(positionPreview, /export default function OpeningPositionPreview/);
});

test("the opening catalog validates its schema and exposes a retry state", () => {
  assert.match(app, /const openingSchemaVersion = 10/);
  assert.match(app, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(app, /catalog_revision !== data\.catalog_revision/);
  assert.match(app, /response\.ok.*schema_version !== openingSchemaVersion/s);
  assert.match(app, /setMapError\("開局地圖載入失敗，請檢查網路後重試。"\)/);
  assert.match(app, /className="catalog-load-error" role="alert"/);
  assert.match(app, /setMapRetry\(\(value\) => value \+ 1\)/);
});

test("opening detail CSS follows the lazy detail chunk without taking shared board styles", () => {
  assert.match(detail, /import "\.\/OpeningDetail\.css"/);
  assert.match(detailCss, /\.detail-content/);
  assert.match(detailCss, /\.line-choices/);
  assert.match(detailCss, /\.core-followups/);
  assert.match(detailCss, /\.famous-game-list/);
  assert.match(detailCss, /\.variation-opponent/);
  assert.match(detailCss, /\.phase-roadmap/);
  assert.match(detailCss, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(globalCss, /\.(?:detail-content|line-choices|core-followups|famous-game-list|variation-opponent|phase-roadmap)\b/);
  assert.match(globalCss, /\.board \{/);
  assert.match(globalCss, /\.move-line/);
  assert.match(globalCss, /\.opening-mini-study/);
});

test("the large puzzle browser loads only when its tab is opened", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/PuzzleExplorer"\)\)/);
  assert.doesNotMatch(app, /fetch\("\.\/notion-puzzles\.json"\)/);
  assert.match(puzzles, /export default function PuzzleExplorer/);
  assert.match(puzzles, /fetch\("\.\/notion-puzzles\.json"\)/);
  assert.match(puzzles, /previousFen && selected\.previousMove/);
  assert.match(puzzles, /"查看解答"/);
  assert.match(puzzles, /analysis\.status !== "ready"/);
  assert.match(puzzles, /setPuzzleAnswer\(move\)/);
});

test("concept lessons and opponent practice are separate on-demand chunks", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/ConceptExplorer"\)\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/OpponentExplorer"\)\)/);
  assert.doesNotMatch(app, /const (?:endgameLessons|opponentLevels) =/);
  assert.match(concepts, /export default function ConceptExplorer/);
  assert.match(concepts, /基本戰術／技巧辨識/);
  assert.match(opponents, /export default function OpponentExplorer/);
  assert.match(opponents, /blind-live-board/);
  assert.match(opponents, /playerColor === "black"/);
});

test("secondary opening explorers load only when their tabs are opened", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/StyleExplorer"\)\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/TranspositionExplorer"\)\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/AnalogyExplorer"\)\)/);
  assert.doesNotMatch(app, /function (?:StyleExplorer|TranspositionExplorer|AnalogyExplorer)/);
  assert.match(styles, /export default function StyleExplorer/);
  assert.match(transpositions, /export default function TranspositionExplorer/);
  assert.match(transpositions, /精確同局面/);
  assert.match(analogies, /export default function AnalogyExplorer/);
  assert.match(analogies, /非精確轉置/);
  assert.match(app, /<b>類似比較<\/b><small>黑方防禦對照白方進攻體系<\/small>/);
  assert.match(app, /"transpositions", "analogies"/);
  assert.match(app, /fetch\("\.\/opening-explorers\.json"\)/);
  assert.match(app, /function switchLens\(next: Lens\).*loadOpeningExplorerData\(\)/s);
  assert.match(app, /if \(!data \|\| explorerData \|\| !\["transpositions", "analogies"\]\.includes\(lens\)\) return/);
  assert.match(app, /<TranspositionExplorer nodes=\{data\.nodes\} groups=\{explorerData\.transpositionGroups\}/);
  assert.match(app, /<AnalogyExplorer nodes=\{data\.nodes\} groups=\{explorerData\.analogyGroups\}/);
});

test("secondary explorer CSS follows its lazy JavaScript chunk", () => {
  assert.match(styles, /import "\.\/StyleExplorer\.css"/);
  assert.match(transpositions, /import "\.\/TranspositionExplorer\.css"/);
  assert.match(analogies, /import "\.\/AnalogyExplorer\.css"/);
  assert.match(styleCss, /\.style-grid/);
  assert.match(styleCss, /@media \(max-width: 560px\)/);
  assert.match(transpositionCss, /\.transposition-layout/);
  assert.match(transpositionCss, /@media \(max-width: 560px\)/);
  assert.match(analogyCss, /\.analogy-layout/);
  assert.match(analogyCss, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(globalCss, /\.(?:style-grid|transposition-layout|analogy-layout)/);
});

test("the puzzle browser CSS follows its lazy JavaScript chunk", () => {
  assert.match(puzzles, /import "\.\/PuzzleExplorer\.css"/);
  assert.match(puzzleCss, /\.puzzle-browser/);
  assert.match(puzzleCss, /\.notion-puzzle-preview/);
  assert.match(puzzleCss, /\.puzzle-answer/);
  assert.match(puzzleCss, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(globalCss, /\.(?:puzzle-browser|notion-puzzle-preview|puzzle-answer)/);
  assert.doesNotMatch(globalCss, /\.puzzle-portal/);
  assert.doesNotMatch(puzzleCss, /\.puzzle-portal/);
});

test("concept lessons and opponent practice CSS follow their lazy chunks", () => {
  assert.match(concepts, /import "\.\/ConceptExplorer\.css"/);
  assert.match(opponents, /import "\.\/OpponentExplorer\.css"/);
  assert.match(conceptCss, /\.concept-phase-grid/);
  assert.match(conceptCss, /\.passed-pawn-practice-layout/);
  assert.match(conceptCss, /\.tactics-practice-layout/);
  assert.match(conceptCss, /@media \(max-width: 520px\)/);
  assert.match(opponentCss, /\.opponent-layout/);
  assert.match(opponentCss, /\.opening-recognition/);
  assert.match(opponentCss, /\.match-mode-selector/);
  assert.match(opponentCss, /\.blind-live-board/);
  assert.match(opponentCss, /@media \(max-width: 520px\)/);
  assert.doesNotMatch(globalCss, /\.(?:concept-phase-grid|passed-pawn-practice-layout|tactics-practice-layout|opponent-layout|opening-recognition|match-mode-selector|blind-live-board)/);
  assert.doesNotMatch(globalCss, /\.new-practice/);
  assert.doesNotMatch(opponentCss, /\.new-practice/);
});
