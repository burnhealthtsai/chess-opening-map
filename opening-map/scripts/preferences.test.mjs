import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/preferences.ts", import.meta.url), "utf8").catch(() => "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const preferences = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

function installStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  globalThis.window = {
    localStorage: {
      getItem(key) { return entries.get(key) ?? null; },
      setItem(key, value) { entries.set(key, value); },
    },
  };
  return entries;
}

test("stored opening-map choices survive reloads and reject stale values", () => {
  installStorage({ "opening-map:piece-style": "robot", "opening-map:board-style": "night" });
  assert.equal(preferences.readStoredChoice("piece-style", ["original", "robot"], "original"), "robot");
  assert.equal(preferences.readStoredChoice("board-style", ["wood", "night"], "wood"), "night");

  installStorage({ "opening-map:piece-style": "retired-theme" });
  assert.equal(preferences.readStoredChoice("piece-style", ["original", "robot"], "original"), "original");
});

test("boolean preferences and unavailable storage fail safely", () => {
  const entries = installStorage({ "opening-map:dark": "true" });
  assert.equal(preferences.readStoredBoolean("dark", false), true);
  preferences.writeStoredPreference("dark", false);
  assert.equal(entries.get("opening-map:dark"), "false");

  globalThis.window = { get localStorage() { throw new Error("blocked"); } };
  assert.equal(preferences.readStoredBoolean("dark", false), false);
  assert.doesNotThrow(() => preferences.writeStoredPreference("dark", true));
});
