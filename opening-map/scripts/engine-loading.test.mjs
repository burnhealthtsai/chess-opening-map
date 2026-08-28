import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("../src/Chessboard.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const openingDetail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8");
const opponents = await readFile(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");
const puzzles = await readFile(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8");
const stockfish = await readFile(new URL("../src/useStockfish.ts", import.meta.url), "utf8");
const copyStockfish = await readFile(new URL("./copy-stockfish.mjs", import.meta.url), "utf8");
const stockfishPackage = JSON.parse(await readFile(new URL("../node_modules/stockfish/package.json", import.meta.url), "utf8"));
const puzzleRefresh = await readFile(new URL("./refresh-puzzle-solutions.mjs", import.meta.url), "utf8");

test("the map Mini Live Board defers Stockfish until its panel is expanded", () => {
  assert.match(app, /<Chessboard[^>]+deferAnalysis[^>]+onBestMove=/);
  assert.match(board, /deferAnalysis\?: boolean/);
  assert.match(board, /const \[analysisRequested, setAnalysisRequested\] = useState\(\(\) => !deferAnalysis\)/);
  assert.match(board, /onExpandedChange=\{setAnalysisRequested\}/);
  assert.match(board, /initiallyCollapsed=\{deferAnalysis\}/);
});

test("browser Stockfish assets use the installed package version as an immutable URL namespace", () => {
  const declaredVersion = stockfish.match(/STOCKFISH_ASSET_VERSION = "([^"]+)"/)?.[1];
  assert.equal(declaredVersion, stockfishPackage.version);
  assert.match(stockfish, /stockfish\/\$\{STOCKFISH_ASSET_VERSION\}\/\$\{file\}/);
  assert.match(stockfish, /stockfishAssetUrl\("stockfish-18-lite-single\.js"\)/);
  assert.match(board, /stockfishAssetUrl\("Copying\.txt"\)/);
  assert.match(copyStockfish, /resolve\(destinationRoot, packageMetadata\.version\)/);
  assert.match(copyStockfish, /rm\(destinationRoot, \{ recursive: true, force: true \}\)/);
});

test("entry-level blind chess does not start Stockfish in the background", () => {
  assert.match(board, /Boolean\(opponentLevel && opponentLevel > 1\)/);
  assert.match(opponents, /analysis=\{matchMode === "normal" \|\| blindStockfish\}/);
  assert.match(opponents, /deferAnalysis=\{matchMode === "normal" && level === 1\}/);
  assert.match(opponents, /const \[blindStockfish, setBlindStockfish\] = useState\(false\)/);
});

test("opening details defer Stockfish and shut an expanded engine down cleanly", () => {
  assert.match(openingDetail, /<Chessboard[^>]+interactive analysis deferAnalysis/);
  assert.match(stockfish, /worker\.onmessage = null/);
  assert.match(stockfish, /worker\.onerror = \(event\) => \{ event\.preventDefault\(\); \}/);
  assert.match(stockfish, /worker\.postMessage\("stop"\)/);
  assert.match(stockfish, /worker\.postMessage\("quit"\)/);
  assert.match(stockfish, /window\.setTimeout\(\(\) => \{[\s\S]*worker\.terminate\(\)[\s\S]*\}, 50\)/);
  assert.match(stockfish, /else setAnalysis\(initialAnalysis\)/);
  assert.match(board, /analysis && analysisRequested && displayedBestMove/);
  assert.match(board, /onExpandedChange\?\.\(!next\)/);
  assert.match(board, /const evaluation = !enabled \? "—"/);
  assert.match(board, /enabled && analysis\.depth \? `· 深度/);
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

test("Stockfish 被瀏覽器封鎖時只標記引擎不可用", () => {
  assert.match(stockfish, /try\s*\{\s*worker = new Worker\(workerUrl\);\s*\}\s*catch\s*\{/);
  assert.match(stockfish, /function markEngineUnavailable\(\)/);
  assert.match(stockfish, /status: "error"/);
  assert.match(stockfish, /try\s*\{\s*worker\.postMessage\(command\);/);
  assert.match(stockfish, /try \{ worker\.terminate\(\); \} catch/);
});
