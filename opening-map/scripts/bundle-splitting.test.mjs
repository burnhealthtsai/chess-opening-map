import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8").catch(() => "");
const puzzles = await readFile(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8").catch(() => "");

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
