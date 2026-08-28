import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const puzzles = readFileSync(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8");
const opponents = readFileSync(new URL("../src/OpponentExplorer.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const classification = readFileSync(new URL("../src/ClassificationMap.tsx", import.meta.url), "utf8");
const styleExplorer = readFileSync(new URL("../src/StyleExplorer.tsx", import.meta.url), "utf8");

test("global search has an explicit name, full pointer target and visible focus ring", () => {
  assert.match(app, /<span aria-hidden="true">⌕<\/span><input aria-label="搜尋開局、中英文或 ECO"/);
  assert.match(styles, /\.search:focus-within \{[^}]*border-color: #f5a524;[^}]*box-shadow:/);
  assert.match(styles, /\.search input \{[^}]*min-height: 32px;/);
});

test("toggle and selection controls expose their state without relying on color", () => {
  assert.equal([...app.matchAll(/aria-pressed=\{lens ===/g)].length, 7);
  assert.equal([...app.matchAll(/aria-current=\{lens ===/g)].length, 7);
  assert.equal([...app.matchAll(/<span aria-hidden="true">[♞◎♚◆✦⇄≈]<\/span>/g)].length, 7);
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

test("conditional taxonomy panels expose only references that exist", () => {
  assert.match(classification, /aria-controls=\{expanded \? `subgroup-\$\{side\}-\$\{zone\.move\}-\$\{subgroup\.id\}` : undefined\}/);
  assert.doesNotMatch(classification, /aria-controls=\{`subgroup-\$\{side\}-\$\{zone\.move\}-\$\{subgroup\.id\}`\}/);
  assert.match(classification, /<span aria-hidden="true">★<\/span>/);
});

test("learning-style symbols stay decorative", () => {
  assert.match(styleExplorer, /<span aria-hidden="true">\{\["◎", "⚡", "↗", "◆", "♟"\]\[index\]\}<\/span>/);
});

test("practice mode symbols stay decorative", () => {
  assert.match(opponents, /<span aria-hidden="true">♟<\/span>/);
  assert.match(opponents, /<span aria-hidden="true">◌<\/span>/);
});

test("autoplay pause control meets normal-text contrast", () => {
  const channel = (value) => { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; };
  const luminance = (hex) => { const values = hex.match(/[0-9a-f]{2}/gi).map((value) => channel(Number.parseInt(value, 16))); return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]; };
  const foreground = luminance("ffffff");
  const background = luminance("a95f00");
  assert.ok((foreground + 0.05) / (background + 0.05) >= 4.5);
  assert.match(styles, /\.board-controls button\.pause-toggle \{ color: #fff; background: #a95f00;/);
});

test("puzzle result changes, pagination and detail loading have assistive semantics", () => {
  assert.match(puzzles, /className="puzzle-result-heading" aria-live="polite"/);
  assert.match(puzzles, /<nav className="puzzle-pagination" aria-label="謎題分頁">/);
  assert.match(puzzles, /className="notion-puzzle-preview puzzle-detail-state" role="status" aria-live="polite"/);
});

test("toolbar filters appear only where their values affect visible results", () => {
  assert.match(app, /const searching = Boolean\(query\.trim\(\)\)/);
  assert.match(app, /const showSideFilter = lens === "style" \|\| searching/);
  assert.match(app, /const showCategoryFilter = lens === "family" \|\| lens === "style" \|\| searching/);
  assert.match(app, /const showClearFilters = searching \|\| \(showCategoryFilter && category !== all\) \|\| \(showSideFilter && styleSide !== all\)/);
  assert.match(app, /\{showSideFilter && <Filter label="陣營"/);
  assert.match(app, /\{showCategoryFilter && <Filter label="類別"/);
  assert.match(app, /\{showClearFilters && <button className="clear-button"/);
});
