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

test("opening details and knowledge load only after an opening is selected", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/OpeningDetail"\)\)/);
  assert.match(app, /<Suspense fallback=/);
  assert.doesNotMatch(app, /from "\.\/openingKnowledge"/);
  assert.match(detail, /export default function OpeningDetail/);
  assert.match(detail, /from "\.\/openingKnowledge"/);
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
});
