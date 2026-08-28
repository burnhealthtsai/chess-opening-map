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

test("opening dialogs announce themselves, trap focus and return it after Escape", () => {
  assert.match(app, /role="dialog" aria-modal="true" aria-label=\{`\$\{selected\.title_zh\}開局詳情`\}/);
  assert.match(app, /modalDetailRef\.current\?\.querySelector<HTMLButtonElement>\("\.detail-close"\)\?\.focus\(\)/);
  assert.match(app, /document\.addEventListener\("keydown", onModalKeyDown, true\)/);
  assert.match(app, /if \(event\.key === "Escape"\)/);
  assert.match(app, /if \(event\.key !== "Tab"\) return/);
  assert.match(app, /\(event\.shiftKey \? last : first\)\.focus\(\)/);
  assert.match(app, /if \(trigger\?\.isConnected\) trigger\.focus\(\)/);
  assert.match(app, /<DetailLoadError[^>]+onClose=\{closeOpening\}/);
});

test("WASD follows only the openings visible in the current explorer", () => {
  assert.match(app, /if \(query\.trim\(\)\) \{\s*candidates = visibleSearchResults;/);
  assert.match(app, /else if \(lens === "family"\)/);
  assert.match(app, /!selectedFirstMove \|\| node\.first_move === selectedFirstMove/);
  assert.match(app, /!selectedFamily \|\| node\.family\.id === selectedFamily/);
  assert.match(app, /else if \(lens === "style" && selectedStyle\)/);
  assert.match(app, /const nextIndex = index < 0 \? \(change < 0 \? candidates\.length - 1 : 0\)/);
  assert.doesNotMatch(app, /Math\.max\(0, candidates\.findIndex/);
});
