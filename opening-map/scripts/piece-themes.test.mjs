import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/pieceThemes.ts", import.meta.url), "utf8");
const testableSource = source.replace(
  /const rasterImages = import\.meta\.glob\([^;]+;/,
  'const rasterImages = new Proxy({}, { get: (_, path) => `/assets/${String(path).split("/").slice(-2).join("/").replace(".webp", "-contenthash.webp")}` });',
);
const compiled = ts.transpileModule(testableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const themes = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("raster piece art is bundled as fingerprinted Vite assets", async () => {
  assert.match(source, /import\.meta\.glob\("\.\/assets\/pieces\/\*\*\/\*\.webp"/);
  assert.doesNotMatch(source, /url\("\.\/pieces\//);
  const root = new URL("../src/assets/pieces/", import.meta.url);
  const folders = await readdir(root);
  assert.deepEqual(folders.sort(), ["ceramic-storybook", "egyptian-monument", "fairytale-animation", "neon-punk"]);
  let totalBytes = 0;
  for (const folder of folders) {
    const files = (await readdir(new URL(`${folder}/`, root))).sort();
    assert.deepEqual(files, ["bishop.webp", "king.webp", "knight.webp", "pawn.webp", "queen.webp", "rook.webp"]);
    for (const file of files) totalBytes += (await stat(new URL(`${folder}/${file}`, root))).size;
  }
  assert.ok(totalBytes < 2_100_000, `lossless raster themes should stay under 2.1 MB, received ${totalBytes}`);
});

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
  assert.match(css, /assets\/ceramic-storybook\/king-contenthash\.webp/);
  assert.doesNotMatch(css, /assets\/(?:neon-punk|egyptian-monument)\//);
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
  assert.match(style.textContent, /assets\/ceramic-storybook\/pawn-contenthash\.webp/);
  assert.doesNotMatch(style.textContent, /data-piece-style="magic"/);

  themes.installPieceTheme("original");
  assert.equal(style.isConnected, false);
});
