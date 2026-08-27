import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/pieceThemes.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const themes = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("original pieces inject no generated theme CSS", () => {
  assert.equal(themes.pieceThemeCss("original"), "");
});

test("vector themes generate only the selected twelve side-and-role rules", () => {
  const css = themes.pieceThemeCss("magic");
  assert.equal(css.split("\n").length, 12);
  assert.match(css, /data-piece-style="magic"/);
  assert.doesNotMatch(css, /data-piece-style="(?:zombie|robot|myth)"/);
});

test("raster themes generate only the selected twelve image rules", () => {
  const css = themes.pieceThemeCss("ceramic-storybook");
  assert.equal(css.split("\n").length, 12);
  assert.match(css, /pieces\/ceramic-storybook\/king\.png/);
  assert.doesNotMatch(css, /pieces\/(?:neon-punk|egyptian-monument)\//);
});

test("the installed style is replaced on selection and removed for original pieces", () => {
  const style = {
    dataset: {},
    textContent: "",
    isConnected: false,
    remove() { this.isConnected = false; },
  };
  globalThis.document = {
    createElement() { return style; },
    head: { append(element) { element.isConnected = true; } },
  };

  themes.installPieceTheme("magic");
  assert.equal(style.isConnected, true);
  assert.equal(style.dataset.generatedPieceTheme, "magic");
  assert.match(style.textContent, /data-piece-style="magic"/);

  themes.installPieceTheme("ceramic-storybook");
  assert.equal(style.dataset.generatedPieceTheme, "ceramic-storybook");
  assert.match(style.textContent, /pieces\/ceramic-storybook\/pawn\.png/);
  assert.doesNotMatch(style.textContent, /data-piece-style="magic"/);

  themes.installPieceTheme("original");
  assert.equal(style.isConnected, false);
});
