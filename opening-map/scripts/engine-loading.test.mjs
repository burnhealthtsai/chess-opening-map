import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("../src/Chessboard.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const opponents = await readFile(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");
const puzzles = await readFile(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8");
const puzzleRefresh = await readFile(new URL("./refresh-puzzle-solutions.mjs", import.meta.url), "utf8");

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

test("查看謎題解答使用已驗證解答，不在背景重算", () => {
  assert.match(puzzles, /answerUci: string/);
  assert.match(puzzles, /answerSan: string/);
  assert.match(puzzles, /solutionLine: string\[\]/);
  assert.match(puzzles, /analysis=\{showStockfish\}/);
  assert.doesNotMatch(puzzles, /analysis=\{showStockfish \|\| showAnswer\}/);
  assert.match(puzzles, /preferredBestMove=\{selected\.answerUci\}/);
  assert.match(puzzles, /preferredBestMoveFen=\{selected\.fen\}/);
  assert.match(puzzles, /orientation=\{selected\.side === "黑方" \? "black" : "white"\}/);
  assert.match(puzzles, /selected\.solutionLine\.join\(" "\)/);
  assert.match(board, /preferredBestMove\?: string/);
  assert.match(board, /preferredBestMoveFen\?: string/);
  assert.match(puzzleRefresh, /stockfish-18-lite-single\.js/);
  assert.match(puzzleRefresh, /setoption name Clear Hash/);
  assert.match(puzzleRefresh, /go depth \$\{engineDepth\}/);
});
