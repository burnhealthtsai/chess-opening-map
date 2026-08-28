import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/catalogSnapshot.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const snapshots = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

const revision = "a".repeat(64);
const validCatalog = {
  schema_version: 10,
  catalog_revision: revision,
  nodes: [{
    id: "w-test",
    title_zh: "測試開局",
    title_en: "Test Opening",
    side: "白方",
    category: "主流",
    eco: "A00",
    first_move: "e4",
    first_move_san: "e4",
    reply_san: "e5",
    styles: ["開放型"],
    mainline: "1. e4 e5",
    variations: [{ name: "主線", line: "1. e4 e5" }],
    subgroup: { id: "center", label: "中央兵回應" },
    family: { id: "open-game", label: "開放性開局" },
  }],
  navigation: { sides: [], first_moves: [], families: [], styles: [] },
};

function installStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: {
      getItem(key) { return entries.get(key) ?? null; },
      setItem(key, value) { entries.set(key, value); },
      removeItem(key) { entries.delete(key); },
    },
  };
  return entries;
}

test("accepts only a complete catalog with the current schema and revision hash", () => {
  assert.equal(snapshots.isOpeningMapData(validCatalog, 10), true);
  assert.equal(snapshots.isOpeningMapData({ ...validCatalog, schema_version: 9 }, 10), false);
  assert.equal(snapshots.isOpeningMapData({ ...validCatalog, catalog_revision: "stale" }, 10), false);
  assert.equal(snapshots.isOpeningMapData({ ...validCatalog, nodes: [] }, 10), false);
  assert.equal(snapshots.isOpeningMapData({ ...validCatalog, nodes: [{ ...validCatalog.nodes[0], variations: null }] }, 10), false);
  assert.equal(snapshots.isOpeningMapData({ ...validCatalog, navigation: { sides: [] } }, 10), false);
});

test("writes and restores a validated catalog snapshot", () => {
  const entries = installStorage();
  assert.equal(snapshots.writeOpeningMapSnapshot(validCatalog, 10), true);
  assert.equal(entries.has(snapshots.openingMapSnapshotKey), true);
  assert.deepEqual(snapshots.readOpeningMapSnapshot(10), validCatalog);
});

test("removes corrupt or stale snapshots and survives unavailable storage", () => {
  const corrupt = installStorage({ [snapshots.openingMapSnapshotKey]: "not-json" });
  assert.equal(snapshots.readOpeningMapSnapshot(10), null);
  assert.equal(corrupt.has(snapshots.openingMapSnapshotKey), false);

  const stale = installStorage({ [snapshots.openingMapSnapshotKey]: JSON.stringify({ ...validCatalog, schema_version: 9 }) });
  assert.equal(snapshots.readOpeningMapSnapshot(10), null);
  assert.equal(stale.has(snapshots.openingMapSnapshotKey), false);

  globalThis.window = { get localStorage() { throw new Error("blocked"); } };
  assert.equal(snapshots.readOpeningMapSnapshot(10), null);
  assert.equal(snapshots.writeOpeningMapSnapshot(validCatalog, 10), false);
});
