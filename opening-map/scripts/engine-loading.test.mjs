import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("../src/Chessboard.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const opponents = await readFile(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");

test("the map Mini Live Board defers Stockfish until its panel is expanded", () => {
  assert.match(app, /<Chessboard[^>]+deferAnalysis[^>]+onBestMove=/);
  assert.match(board, /deferAnalysis\?: boolean/);
  assert.match(board, /const \[analysisRequested, setAnalysisRequested\] = useState\(\(\) => !deferAnalysis\)/);
  assert.match(board, /onExpand=\{\(\) => setAnalysisRequested\(true\)\}/);
  assert.match(board, /initiallyCollapsed=\{deferAnalysis\}/);
});

test("entry-level blind chess does not start Stockfish in the background", () => {
  assert.match(board, /Boolean\(opponentLevel && opponentLevel > 1\)/);
  assert.match(opponents, /analysis=\{matchMode === "normal" \|\| blindStockfish\}/);
  assert.match(opponents, /deferAnalysis=\{matchMode === "normal" && level === 1\}/);
  assert.match(opponents, /const \[blindStockfish, setBlindStockfish\] = useState\(false\)/);
});
