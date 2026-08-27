import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Chess } from "chess.js";
import { buildMapData, sanMoves } from "./build-map-data.mjs";

const catalog = JSON.parse(await readFile(resolve("..", "openings.yaml"), "utf8"));
const variationCatalog = JSON.parse(await readFile(resolve("..", "variations.json"), "utf8"));

test("keeps every opening as one valid node", () => {
  const data = buildMapData(catalog);
  assert.equal(data.nodes.length, 196);
  assert.equal(new Set(data.nodes.map((node) => node.id)).size, 196);
  for (const node of data.nodes) {
    assert.ok(node.subgroup.id && node.family.id && node.style.id && node.mainline && node.variations.length <= 3);
    assert.equal(node.classification_path.length, 5);
    assert.equal(node.classification_path[0], node.side);
    assert.equal(node.classification_path[1], node.first_move);
    assert.equal(node.classification_path[2], node.subgroup.id);
    assert.equal(node.classification_path[3], node.family.id);
    assert.equal(node.classification_path[4], node.id);
    assert.equal(node.first_move_san, sanMoves(node.mainline)[0]);
    assert.equal(node.reply_san, sanMoves(node.mainline)[1] ?? "起手");
    assert.equal(node.first_move, ["e4", "d4", "c4", "Nf3"].includes(node.first_move_san) ? node.first_move_san : "其他");
  }
});

test("relationship edges are unique, symmetric and never self-referential", () => {
  const data = buildMapData(catalog);
  for (const mode of ["family", "style"]) {
    const seen = new Set();
    for (const edge of data.edges[mode]) {
      assert.notEqual(edge.source, edge.target);
      assert.ok(edge.weight > 0);
      const key = [edge.source, edge.target].sort().join(":");
      assert.ok(!seen.has(key));
      seen.add(key);
    }
  }
});

test("navigation hierarchy accounts for all openings without family duplication", () => {
  const data = buildMapData(catalog);
  assert.deepEqual(data.navigation.sides, [{ id: "白方", count: 98 }, { id: "黑方", count: 98 }]);
  assert.equal(data.navigation.first_moves.reduce((sum, item) => sum + item.count, 0), 196);
  assert.equal(data.navigation.families.reduce((sum, item) => sum + item.count, 0), 196);
  assert.deepEqual(data.navigation.styles.map((item) => item.value), ["局面", "戰術", "主動", "穩健", "發展"]);
  for (const family of data.navigation.families) {
    const members = data.nodes.filter((node) => node.side === family.side && node.family.id === family.id);
    assert.equal(members.length, family.count);
    assert.ok(members.every((node) => node.first_move === family.first_move));
    assert.ok(members.every((node) => node.subgroup.id === family.subgroup.id));
  }
});

test("large first-move groups are split into readable secondary groups", () => {
  const data = buildMapData(catalog);
  for (const side of ["白方", "黑方"]) {
    const irregular = data.nodes.filter((node) => node.side === side && node.first_move === "其他");
    if (!irregular.length) continue;
    assert.ok(new Set(irregular.map((node) => node.subgroup.id)).size >= 3);
    assert.ok(Math.max(...Object.values(Object.groupBy(irregular, (node) => node.subgroup.id)).map((nodes) => nodes.length)) < irregular.length);
  }
});

test("merged first-move groups retain every distinct move choice", () => {
  const data = buildMapData(catalog);
  const irregularCenters = data.nodes.filter((node) => node.side === "白方" && node.first_move === "其他" && node.subgroup.id === "center");
  assert.deepEqual([...new Set(irregularCenters.map((node) => node.first_move_san))].sort(), ["d3", "e3"]);
  const expected = new Map([
    ["白方:其他:queen-wing", ["a3", "a4", "b3", "b4", "c3"]],
    ["白方:其他:knight", ["Na3", "Nc3", "Nh3"]],
    ["白方:其他:center", ["d3", "e3"]],
    ["白方:其他:king-wing", ["f3", "f4", "g3", "g4", "h3", "h4"]],
    ["黑方:e4:queen-wing", ["a5", "a6", "b6", "c5", "c6"]],
    ["黑方:e4:knight", ["Na6", "Nc6", "Nf6", "Nh6"]],
    ["黑方:e4:center", ["d5", "d6", "e5", "e6"]],
    ["黑方:e4:king-wing", ["f5", "f6", "g5", "g6", "h5", "h6"]],
  ]);
  for (const [key, choices] of expected) {
    const [side, firstMove, subgroup] = key.split(":");
    const nodes = data.nodes.filter((node) => node.side === side && node.first_move === firstMove && node.subgroup.id === subgroup);
    const routeMoves = [...new Set(nodes.map((node) => node.first_move === "其他" ? node.first_move_san : node.reply_san))].sort();
    assert.deepEqual(routeMoves, choices);
  }
});

test("SAN tokenizer excludes move counters", () => {
  assert.deepEqual(sanMoves("1. e4 e5 2. Nf3 Nc6"), ["e4", "e5", "Nf3", "Nc6"]);
});

test("every Sicilian opening keeps the Chinese family name", () => {
  const data = buildMapData(catalog);
  const sicilians = data.nodes.filter((node) => /Sicilian Defense/i.test(node.title_en));
  assert.ok(sicilians.length > 1);
  assert.ok(sicilians.every((node) => node.title_zh.startsWith("西西里防禦")));
});

test("Meran variation is searchable by the Chinese Milan system alias", () => {
  const data = buildMapData(catalog);
  const meran = data.nodes.find((node) => node.id === "b-semi-slav-defense-meran-variation");
  assert.ok(meran);
  assert.match(meran.title_zh, /梅蘭變例（米蘭體系）/);
});

test("Old Indian keeps the official family recognition line", () => {
  const data = buildMapData(catalog);
  const oldIndian = data.nodes.find((node) => node.id === "b-old-indian-defense");
  assert.equal(oldIndian?.mainline, "1. d4 Nf6 2. c4 d6");
  assert.ok(!oldIndian?.mainline.includes("Bf5"));
});

test("transposition routes reach the exact same normalized FEN", () => {
  const data = buildMapData(catalog, variationCatalog);
  assert.equal(data.schema_version, 5);
  assert.ok(data.transpositionGroups.length >= 6);
  for (const group of data.transpositionGroups) {
    assert.equal(group.relation, "exact");
    assert.equal(group.memberIds.length, new Set(group.memberIds).size);
    assert.ok(group.memberIds.length >= 2);
    assert.ok(new Set(group.routes.map((route) => route.line)).size >= 2);
    for (const route of group.routes) {
      const game = new Chess();
      for (const move of sanMoves(route.line)) game.move(move);
      assert.equal(game.fen().split(" ").slice(0, 4).join(" "), group.targetFen);
    }
  }
});

test("analogy groups compare black defenses with white opening plans without calling them transpositions", () => {
  const data = buildMapData(catalog, variationCatalog);
  assert.ok(data.analogyGroups.length >= 6);
  const openingById = new Map(data.nodes.map((opening) => [opening.id, opening]));
  const sicilianEnglish = data.analogyGroups.find((group) => group.id === "sicilian-english-reversed");
  assert.ok(sicilianEnglish);
  assert.equal(sicilianEnglish.title, "西西里防禦 ↔ 英格蘭開局");
  assert.match(sicilianEnglish.summary, /反色西西里/);
  assert.equal(sicilianEnglish.relation, "reversed");
  assert.ok(sicilianEnglish.blackIds.includes("b-sicilian-defense"));
  assert.ok(sicilianEnglish.whiteIds.includes("w-english-opening"));

  for (const group of data.analogyGroups) {
    assert.ok(["reversed", "structure", "plan"].includes(group.relation));
    assert.ok(group.blackIds.length >= 1);
    assert.ok(group.whiteIds.length >= 1);
    assert.ok(group.sharedIdeas.length >= 2);
    assert.ok(group.difference.length > 0);
    assert.equal(group.blackIds.length, new Set(group.blackIds).size);
    assert.equal(group.whiteIds.length, new Set(group.whiteIds).size);
    assert.ok(group.blackIds.every((id) => openingById.get(id)?.side === "黑方"));
    assert.ok(group.whiteIds.every((id) => openingById.get(id)?.side === "白方"));
  }
});
