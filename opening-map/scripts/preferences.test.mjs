import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source = await readFile(new URL("../src/preferences.ts", import.meta.url), "utf8").catch(() => "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const preferences = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

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

test("saved appearance is restored before the application module executes", () => {
  const bootstrap = index.match(/<script data-appearance-init>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap, "index.html must include a synchronous appearance bootstrap");
  assert.ok(index.indexOf("data-appearance-init") < index.indexOf('type="module"'));

  function run(values) {
    const dataset = {};
    const themeColor = { content: "", setAttribute(_name, value) { this.content = value; } };
    vm.runInNewContext(bootstrap, {
      document: { documentElement: { dataset }, querySelector() { return themeColor; } },
      localStorage: { getItem(key) { return values[key] ?? null; } },
    });
    return { dataset, themeColor: themeColor.content };
  }

  assert.deepEqual(run({ "opening-map:dark": "true", "opening-map:piece-style": "robot", "opening-map:board-style": "night" }), {
    dataset: { theme: "dark", pieceStyle: "robot", boardStyle: "night" },
    themeColor: "#0f1828",
  });
  assert.deepEqual(run({ "opening-map:dark": "maybe", "opening-map:piece-style": "retired", "opening-map:board-style": "broken" }), {
    dataset: { theme: "light", pieceStyle: "original", boardStyle: "wood" },
    themeColor: "#f4f8fc",
  });
});
