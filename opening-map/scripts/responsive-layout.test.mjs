import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/responsive.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
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
  assert.match(styles, /\.classification-atlas \{ overflow-x: auto; \}/);
  assert.match(styles, /\.taxonomy-zones \{ min-width: 560px; \}/);
});

test("mobile filters wrap below the full-width search field", () => {
  assert.match(styles, /\.compact-toolbar \.search \{ flex: 1 0 100%; min-width: 0; \}/);
  assert.match(styles, /\.compact-toolbar \.filter \{ flex: 1 1 100px; min-width: 0; \}/);
  assert.match(styles, /\.compact-toolbar \.filter select \{ width: 100%; min-width: 0; \}/);
});
