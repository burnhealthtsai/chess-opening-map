import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const puzzles = readFileSync(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8");
const opponents = readFileSync(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("global search has an explicit name, full pointer target and visible focus ring", () => {
  assert.match(app, /<span aria-hidden="true">⌕<\/span><input aria-label="搜尋開局、中英文或 ECO"/);
  assert.match(styles, /\.search:focus-within \{[^}]*border-color: #f5a524;[^}]*box-shadow:/);
  assert.match(styles, /\.search input \{[^}]*min-height: 32px;/);
});

test("toggle and selection controls expose their state without relying on color", () => {
  assert.equal([...app.matchAll(/aria-pressed=\{lens ===/g)].length, 7);
  assert.match(app, /className="theme-button" aria-pressed=\{dark\}/);
  assert.match(puzzles, /aria-pressed=\{group === item\}/);
  assert.match(puzzles, /aria-pressed=\{selectedSummary\?\.id === puzzle\.id\}/);
  assert.match(puzzles, /aria-pressed=\{showStockfish\}/);
  assert.match(puzzles, /aria-pressed=\{showAnswer\}/);
  assert.match(opponents, /aria-pressed=\{matchMode === "normal"\}/);
  assert.match(opponents, /aria-pressed=\{matchMode === "blind"\}/);
  assert.match(opponents, /aria-pressed=\{playerColor === "white"\}/);
  assert.match(opponents, /aria-pressed=\{playerColor === "black"\}/);
  assert.match(opponents, /aria-pressed=\{level === item\.value\}/);
  assert.match(opponents, /aria-pressed=\{blindStockfish\}/);
});

test("puzzle result changes, pagination and detail loading have assistive semantics", () => {
  assert.match(puzzles, /className="puzzle-result-heading" aria-live="polite"/);
  assert.match(puzzles, /<nav className="puzzle-pagination" aria-label="謎題分頁">/);
  assert.match(puzzles, /className="notion-puzzle-preview puzzle-detail-state" role="status" aria-live="polite"/);
});
