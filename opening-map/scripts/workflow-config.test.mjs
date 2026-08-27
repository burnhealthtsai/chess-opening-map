import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/deploy-opening-map-pages.yml", import.meta.url), "utf8");

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
  assert.match(workflow, /pnpm generate:data && pnpm generate:engine && pnpm typecheck && pnpm exec vite build/);
  assert.match(workflow, /path: opening-map\/dist/);
});
