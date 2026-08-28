import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("../src/Chessboard.tsx", import.meta.url), "utf8");
const opponents = await readFile(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/OpponentExplorer.css", import.meta.url), "utf8");

test("blind chess hides SAN history and opening recognition by default", () => {
  assert.match(board, /controlsVisible && !blind && \(manualFen \? manualMoves\.length > 0 : safeStep > 0\)/);
  assert.match(opponents, /matchMode === "normal" \? <OpeningRecognition[^>]+> \: <section className="blind-guide-locked">/);
  assert.match(opponents, /盲棋對局不顯示 SAN 棋譜或開局名稱/);
  assert.match(styles, /\.blind-guide-locked \{/);
});

test("blind chess keeps its deliberate memory aids opt-in", () => {
  assert.match(opponents, /blindStockfish \? "關閉 Stockfish" : "需要提示｜開啟 Stockfish"/);
  assert.match(opponents, /<details className="blind-live-board">/);
  assert.match(board, /blind && <button className=\{`manual-toggle/);
  assert.match(board, /setBlindInventory\(\(value\) => !value\)/);
  assert.match(board, /blindInventory \? "結束盤點" : "盤點位置"/);
  assert.match(board, /const pieceLabels: Record<PieceSymbol, string> = \{ k: "王", q: "后", r: "車", b: "象", n: "馬", p: "兵" \}/);
  assert.match(board, /pieceLabels\[piece\.type\]/);
});

test("blind chess does not leak the position through square accessibility or visual states", () => {
  assert.match(board, /const changed = Boolean\(!blind && piece/);
  assert.match(board, /const selectedMarker = !blind && selected/);
  assert.match(board, /const targetMarker = !blind && target/);
  assert.match(board, /const canDrag = Boolean\(!blind && interactive/);
  assert.match(board, /const blindMoveMarker = blind && lastOpponentMove/);
  assert.match(board, /const squareLabel = blind/);
  assert.match(board, /aria-label=\{squareLabel\}/);
  assert.match(board, /className="blind-note" aria-live="polite" aria-atomic="true"/);
});
