import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/deploy-opening-map-pages.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const generator = await readFile(new URL("./build-map-data.mjs", import.meta.url), "utf8");

test("GitHub Pages workflow uses Node 24-based Actions and the pnpm successor setup", () => {
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: pnpm\/setup@v2/);
  assert.match(workflow, /runtime: node@22/);
  assert.match(workflow, /version: 11\.19\.0/);
  assert.match(workflow, /uses: actions\/configure-pages@v6/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /uses: actions\/deploy-pages@v5/);
  assert.doesNotMatch(workflow, /actions\/setup-node|pnpm\/action-setup/);
});

test("GitHub Pages workflow keeps reproducible tests and build gates", () => {
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /run: pnpm test/);
  assert.match(workflow, /run: pnpm build/);
  assert.match(workflow, /path: opening-map\/dist/);
});

test("local and GitHub builds use the same offline reproducible pipeline", () => {
  assert.equal(packageJson.scripts.build, "pnpm generate:data && pnpm generate:engine && tsc --noEmit && vite build");
  assert.doesNotMatch(packageJson.scripts.build, /generate:puzzles/);
  assert.doesNotMatch(packageJson.scripts.dev, /generate:puzzles/);
  assert.doesNotMatch(generator, /generated_at|new Date\(\)\.toISOString\(\)/);
  assert.match(generator, /catalog_revision: catalogRevision/);
  assert.match(workflow, /run: pnpm build/);
});
