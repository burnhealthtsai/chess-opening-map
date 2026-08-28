import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [component, styles] = await Promise.all([
  readFile(new URL("../src/TranspositionExplorer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/TranspositionExplorer.css", import.meta.url), "utf8"),
]);

test("every transposition route identifies its Chinese source opening", () => {
  assert.match(component, /nodes\.find\(\(node\) => node\.id === route\.openingId\)/);
  assert.match(component, /className="route-opening-source"/);
  assert.match(component, /routeOpening\.eco/);
  assert.match(component, /routeOpening\.title_zh/);
  assert.match(styles, /\.route-opening-source/);
  assert.match(styles, /\[data-theme="dark"\] \.route-opening-source/);
});
