import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("Tab switches cards without trapping keyboard focus in the tab list", () => {
  assert.match(app, /target\?\.closest\("\.lens-tabs button"\)/);
  assert.match(app, /target\?\.closest\("a, button, input, textarea, select, summary, \[tabindex\]:not\(\[tabindex='-1'\]\)"\)/);
  assert.match(app, /if \(interactive && !tabButton\) return/);
  assert.match(app, /const direction = event\.shiftKey \? -1 : 1/);
  assert.match(app, /if \(nextIndex < 0 \|\| nextIndex >= lenses\.length\) return/);
  assert.match(app, /querySelectorAll<HTMLButtonElement>\("\.lens-tabs button"\)\[nextIndex\]\?\.focus\(\)/);
  assert.doesNotMatch(app, /\(lenses\.indexOf\(lens\) \+ 1\) % lenses\.length/);
});

test("compact map controls retain at least a 24px pointer target", () => {
  assert.match(styles, /\.breadcrumb button \{[^}]*min-height: 24px/);
  assert.match(styles, /\.floating-key-moves summary \{[^}]*min-height: 28px/);
});

test("Owen Defense uses its dedicated home modal from map and search entry points", () => {
  assert.match(app, /function isOwenOpening\(/);
  assert.equal(app.match(/isOwenOpening\(selected\) \? "opening-home-modal"/g)?.length, 2);
});
