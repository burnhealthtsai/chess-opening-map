import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/responsive.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const classification = await readFile(new URL("../src/ClassificationMap.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const responsive = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("Mini Live Board starts collapsed on phones without disappearing", () => {
  assert.equal(responsive.shouldStartLiveBoardMinimized(390), true);
  assert.equal(responsive.shouldStartLiveBoardMinimized(680), true);
  assert.equal(responsive.shouldStartLiveBoardMinimized(681), false);
  assert.equal(responsive.shouldStartLiveBoardMinimized(1440), false);
});

test("mobile opening taxonomy contains its wide tree instead of widening the page", () => {
  assert.match(styles, /\.family-directory\.detached, \.taxonomy-with-board, \.classification-atlas \{ min-width: 0; max-width: 100%; \}/);
  assert.match(styles, /\.classification-atlas \{[^}]*overflow-x: auto;/);
  assert.match(styles, /\.taxonomy-zones \{ min-width: 560px; \}/);
});

test("mobile opening taxonomy announces and exposes its horizontal scroll region", () => {
  assert.match(classification, /className="classification-atlas" role="region" tabIndex=\{0\}/);
  assert.match(classification, /aria-describedby=\{scrollHintId\}/);
  assert.match(classification, /className="taxonomy-scroll-hint" id=\{scrollHintId\}/);
  assert.match(classification, /左右滑動或使用方向鍵查看更多開局/);
  assert.match(styles, /\.classification-atlas:focus-visible/);
  assert.match(styles, /\.taxonomy-scroll-hint \{[^}]*display: flex;/);
  assert.match(styles, /\[data-theme="dark"\] \.taxonomy-scroll-hint \{[^}]*color: #d8edff;/);
});

test("mobile filters wrap below the full-width search field", () => {
  assert.match(styles, /\.compact-toolbar \.search \{ flex: 1 0 100%; min-width: 0; \}/);
  assert.match(styles, /\.compact-toolbar \.filter \{ flex: 1 1 100px; min-width: 0; \}/);
  assert.match(styles, /\.compact-toolbar \.filter select \{ width: 100%; min-width: 0; \}/);
});

test("tablet navigation keeps seven feature cards in three compact columns", () => {
  assert.match(styles, /@media \(max-width: 1200px\) \{ \.lens-tabs \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/);
  assert.match(styles, /@media \(max-width: 680px\) \{ \.lens-tabs \{ grid-template-columns: repeat\(2, 1fr\); \} \}/);
  assert.doesNotMatch(styles, /@media \(max-width: 900px\) \{ \.lens-tabs \{ grid-template-columns: repeat\(2, 1fr\); \} \}/);
});

test("mobile opening details cannot restore the desktop focused workspace widths", () => {
  const desktopFocusedWidth = styles.lastIndexOf(".workspace.focused { grid-template-columns: minmax(440px, .82fr) minmax(540px, 1.18fr); }");
  const mobileFocusedWidth = styles.indexOf("@media (max-width: 820px) {\n  .workspace.focused { grid-template-columns: minmax(0, 1fr); }\n}", desktopFocusedWidth);
  assert.ok(desktopFocusedWidth >= 0, "missing desktop focused workspace layout");
  assert.ok(mobileFocusedWidth > desktopFocusedWidth, "mobile override must follow the final desktop focused layout");
});
