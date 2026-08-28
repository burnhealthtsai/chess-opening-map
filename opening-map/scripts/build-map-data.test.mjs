import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Chess } from "chess.js";
import { buildCatalogRevision, buildExplorerData, buildMapData, buildOpeningDetails, buildVariationNotes, sanMoves } from "./build-map-data.mjs";

const catalog = JSON.parse(await readFile(resolve("..", "openings.yaml"), "utf8"));
const variationCatalog = JSON.parse(await readFile(resolve("..", "variations.json"), "utf8"));

test("keeps every opening as one valid node", () => {
  const data = buildMapData(catalog);
  assert.equal(data.nodes.length, 196);
  assert.equal(new Set(data.nodes.map((node) => node.id)).size, 196);
  const derivedPaths = new Set();
  for (const node of data.nodes) {
    assert.ok(node.subgroup.id && node.family.id && node.mainline && node.variations.length <= 3);
    const derivedPath = [node.side, node.first_move, node.subgroup.id, node.family.id, node.id].join("/");
    assert.ok(!derivedPaths.has(derivedPath));
    derivedPaths.add(derivedPath);
    assert.ok(!("classification_path" in node));
    assert.ok(!("catalog_first_move" in node));
    assert.ok(!("style" in node));
    assert.equal(node.first_move_san, sanMoves(node.mainline)[0]);
    assert.equal(node.reply_san, sanMoves(node.mainline)[1] ?? "起手");
    assert.equal(node.first_move, ["e4", "d4", "c4", "Nf3"].includes(node.first_move_san) ? node.first_move_san : "其他");
    assert.ok(!("ideas" in node));
    assert.ok(!("plans" in node));
    assert.ok(!("mistakes" in node));
    assert.ok(!("difficulty" in node));
    assert.ok(node.variations.every((variation) => !("note" in variation)));
  }
  assert.equal(derivedPaths.size, data.nodes.length);
});

test("every catalog line is legal and each mainline reaches its source EPD", () => {
  for (const opening of catalog.openings) {
    const game = new Chess();
    for (const move of sanMoves(opening.mainline)) {
      assert.doesNotThrow(() => game.move(move), `${opening.id}: illegal mainline SAN ${move}`);
    }
    assert.equal(opening.mainline.replace(/\s+/g, " ").trim(), opening.source.pgn.replace(/\s+/g, " ").trim(), `${opening.id}: mainline differs from source PGN`);
    assert.equal(game.fen().split(" ").slice(0, 4).join(" "), opening.source.epd, `${opening.id}: mainline differs from source EPD`);
    for (const variation of opening.variations) {
      const variationGame = new Chess();
      for (const move of sanMoves(variation.line)) {
        assert.doesNotThrow(() => variationGame.move(move), `${opening.id} / ${variation.name}: illegal SAN ${move}`);
      }
    }
  }
});

test("keeps detail-only opening content in a paired lazy catalog", () => {
  const revision = buildCatalogRevision(catalog, variationCatalog);
  const map = buildMapData(catalog, variationCatalog, revision);
  const details = buildOpeningDetails(catalog, revision);
  assert.equal(map.schema_version, 10);
  assert.equal(details.schema_version, map.schema_version);
  assert.equal(details.catalog_revision, map.catalog_revision);
  assert.match(map.catalog_revision, /^[a-f0-9]{64}$/);
  assert.ok(!("edges" in map));
  assert.ok(!("transpositionGroups" in map));
  assert.ok(!("analogyGroups" in map));
  assert.ok(details.edges.family.length > 0);
  assert.ok(details.edges.style.length > 0);
  assert.equal(Object.keys(details.openings).length, map.nodes.length);
  assert.deepEqual(Object.keys(details.openings).sort(), map.nodes.map((opening) => opening.id).sort());
  for (const detail of Object.values(details.openings)) {
    assert.ok(detail.difficulty);
    assert.ok(detail.ideas);
    assert.ok(detail.plans.length >= 1);
    assert.ok(Array.isArray(detail.mistakes));
  }
});

test("keeps variation explanations behind their own on-demand catalog", () => {
  const revision = buildCatalogRevision(catalog, variationCatalog);
  const map = buildMapData(catalog, variationCatalog, revision);
  const notes = buildVariationNotes(catalog, revision);
  assert.equal(notes.schema_version, map.schema_version);
  assert.equal(notes.catalog_revision, map.catalog_revision);
  assert.equal(notes.notes.length, map.nodes.length);
  for (const [index, opening] of map.nodes.entries()) {
    assert.equal(notes.notes[index].length, opening.variations.length);
    assert.ok(notes.notes[index].every(Boolean));
  }
});

test("keeps secondary explorer groups in a version-matched lazy catalog", () => {
  const revision = buildCatalogRevision(catalog, variationCatalog);
  const map = buildMapData(catalog, variationCatalog, revision);
  const explorers = buildExplorerData(catalog, variationCatalog, revision);
  assert.equal(explorers.schema_version, map.schema_version);
  assert.equal(explorers.catalog_revision, map.catalog_revision);
  assert.ok(explorers.transpositionGroups.length >= 6);
  assert.ok(explorers.analogyGroups.length >= 6);
});

test("catalog revision is deterministic and changes with source content", () => {
  const revision = buildCatalogRevision(catalog, variationCatalog);
  assert.equal(buildCatalogRevision(catalog, variationCatalog), revision);
  const changedCatalog = structuredClone(catalog);
  changedCatalog.openings[0].title_zh += "測試";
  assert.notEqual(buildCatalogRevision(changedCatalog, variationCatalog), revision);
});

test("relationship edges are unique, symmetric and never self-referential", () => {
  const data = buildOpeningDetails(catalog);
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

test("canonical translated families retain their full Chinese prefix", () => {
  const data = buildMapData(catalog);
  const canonicalPrefixes = new Map([
    ["English Opening", "英格蘭開局"],
    ["Catalan Opening", "加泰隆尼亞開局"],
    ["Scandinavian Defense", "斯堪地那維亞防禦"],
  ]);
  for (const [englishFamily, chinesePrefix] of canonicalPrefixes) {
    const members = data.nodes.filter((opening) => opening.title_en === englishFamily || opening.title_en.startsWith(`${englishFamily}:`));
    assert.ok(members.length >= 1, `${englishFamily} should exist`);
    assert.ok(members.every((opening) => opening.title_zh.startsWith(chinesePrefix)), `${englishFamily} has an inconsistent Chinese prefix`);
  }
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

test("major Indian defenses keep opening-specific teaching instead of one shared template", () => {
  const ids = [
    "b-kings-indian-defense",
    "b-grunfeld-defense",
    "b-nimzo-indian-defense",
    "b-queens-indian-defense",
    "b-bogo-indian-defense",
    "b-old-indian-defense",
    "b-benoni-defense",
    "b-benoni-defense-modern",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("b-nimzo-indian-defense").ideas, /…Bb4|c3 馬/);
  assert.match(byId.get("b-queens-indian-defense").ideas, /…b6、…Bb7/);
  assert.match(byId.get("b-bogo-indian-defense").ideas, /…Bb4\+/);
  assert.match(byId.get("b-old-indian-defense").ideas, /e7/);
  assert.match(byId.get("b-old-indian-defense").ideas, /而不是.*…Bg7/);
  assert.match(byId.get("b-grunfeld-defense").ideas, /早期…d5/);
});

test("major white systems keep opening-specific plans and the Colle uses its standard formation", () => {
  const ids = [
    "w-center-game",
    "w-london-system",
    "w-rapport-jobava-system",
    "w-colle-system",
    "w-torre-attack",
    "w-trompowsky-attack",
    "w-richter-veresov-attack",
    "w-polish-opening",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  const colle = byId.get("w-colle-system");
  assert.equal(colle.eco, "D05");
  assert.equal(colle.mainline, "1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3");
  assert.equal(colle.source.name, "Queen's Pawn Game: Colle System");
  assert.ok(colle.variations.every((variation) => !/Pterodactyl|Rhamphorhynchus/.test(variation.name)));
  assert.match(byId.get("w-london-system").ideas, /象.*f4.*e3/);
  assert.match(byId.get("w-rapport-jobava-system").ideas, /后馬.*c3.*象.*f4/);
  assert.match(byId.get("w-trompowsky-attack").ideas, /2\.Bg5/);
  assert.match(byId.get("w-polish-opening").ideas, /1\.b4/);
});

test("major open king-pawn openings keep distinct teaching and the Scotch uses its core line", () => {
  const ids = [
    "w-italian-game",
    "w-ruy-lopez",
    "w-scotch-game",
    "w-vienna-game",
    "w-four-knights-game",
    "w-ponziani-opening",
    "w-bishops-opening",
    "w-italian-game-evans-gambit",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  const scotch = byId.get("w-scotch-game");
  assert.equal(scotch.mainline, "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4");
  assert.equal(scotch.source.pgn, scotch.mainline);
  assert.doesNotMatch(scotch.mainline, /Qh4|Nb5|Bb4\+/);
  assert.match(byId.get("w-ruy-lopez").ideas, /Bb5.*c6 馬.*e5/);
  assert.match(byId.get("w-ponziani-opening").ideas, /3\.c3.*d4/);
  assert.match(byId.get("w-italian-game-evans-gambit").ideas, /4\.b4.*c3.*d4/);
});

test("queen's gambit defenses keep distinct structures and core recognition lines", () => {
  const ids = [
    "b-queens-gambit-declined",
    "b-queens-gambit-accepted",
    "b-slav-defense",
    "b-semi-slav-defense",
    "b-queens-gambit-declined-albin-countergambit",
    "b-queens-gambit-declined-chigorin-defense",
    "b-tarrasch-defense",
    "b-queens-gambit-declined-orthodox-defense",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  const coreLines = new Map([
    ["b-queens-gambit-declined", "1. d4 d5 2. c4 e6"],
    ["b-queens-gambit-accepted", "1. d4 d5 2. c4 dxc4"],
    ["b-slav-defense", "1. d4 d5 2. c4 c6"],
  ]);
  for (const [id, line] of coreLines) {
    assert.equal(byId.get(id).mainline, line);
    assert.equal(byId.get(id).source.pgn, line);
  }
  assert.match(byId.get("b-queens-gambit-accepted").ideas, /…dxc4.*不長期守兵/);
  assert.match(byId.get("b-semi-slav-defense").ideas, /…c6與…e6/);
  assert.match(byId.get("b-tarrasch-defense").ideas, /孤立 d5兵/);
  assert.match(byId.get("b-queens-gambit-declined-albin-countergambit").ideas, /2…e5.*d4/);
});

test("major flank openings keep distinct plans and accurately named recognition lines", () => {
  const ids = [
    "w-catalan-opening",
    "w-zukertort-opening",
    "w-english-opening",
    "w-reti-opening",
    "w-bird-opening",
    "w-nimzo-larsen-attack",
    "w-catalan-opening-open-defense",
    "w-english-opening-four-knights-system",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  const zukertort = byId.get("w-zukertort-opening");
  assert.equal(zukertort.eco, "A04");
  assert.equal(zukertort.mainline, "1. Nf3");
  assert.equal(zukertort.source.pgn, zukertort.mainline);
  const openCatalan = byId.get("w-catalan-opening-open-defense");
  assert.equal(openCatalan.eco, "E02");
  assert.equal(openCatalan.mainline, "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4");
  assert.equal(openCatalan.source.pgn, openCatalan.mainline);
  const englishFourKnights = byId.get("w-english-opening-four-knights-system");
  assert.match(englishFourKnights.title_zh, /尼姆佐維奇變例/);
  assert.match(englishFourKnights.title_en, /Nimzowitsch Variation/);
  assert.ok(englishFourKnights.aliases.includes("英格蘭開局：四馬體系"));
  assert.match(byId.get("w-bird-opening").ideas, /1\.f4.*e5/);
  assert.match(byId.get("w-nimzo-larsen-attack").ideas, /1\.b3、Bb2/);
});

test("major asymmetric king-pawn defenses keep distinct strategies and family lines", () => {
  const ids = [
    "b-scandinavian-defense",
    "b-pirc-defense",
    "b-modern-defense",
    "b-alekhine-defense",
    "b-owen-defense",
    "b-nimzowitsch-defense",
    "b-scandinavian-defense-portuguese-gambit",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  const coreLines = new Map([
    ["b-scandinavian-defense", ["B01", "1. e4 d5"]],
    ["b-modern-defense", ["B06", "1. e4 g6"]],
    ["b-alekhine-defense", ["B02", "1. e4 Nf6"]],
    ["b-nimzowitsch-defense", ["B00", "1. e4 Nc6"]],
  ]);
  for (const [id, [eco, line]] of coreLines) {
    assert.equal(byId.get(id).eco, eco);
    assert.equal(byId.get(id).mainline, line);
    assert.equal(byId.get(id).source.pgn, line);
  }
  assert.match(byId.get("b-pirc-defense").ideas, /Nf6先攻 e4.*現代防禦/);
  assert.match(byId.get("b-owen-defense").ideas, /1…b6、…Bb7/);
  assert.match(byId.get("b-scandinavian-defense-portuguese-gambit").ideas, /2\.exd5.*…Nf6.*…Bg4/);
});

test("named open king-pawn systems keep structure-specific teaching", () => {
  const ids = [
    "w-scotch-game-scotch-gambit",
    "w-vienna-game-vienna-gambit",
    "w-ruy-lopez-exchange-variation",
    "w-ruy-lopez-closed",
    "w-vienna-gambit-with-max-lange-defense",
    "b-petrovs-defense",
    "b-philidor-defense",
    "b-italian-game-two-knights-defense",
    "b-ruy-lopez-berlin-defense",
    "b-ruy-lopez-marshall-attack",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-scotch-game-scotch-gambit").ideas, /4\.Bc4.*f7/);
  assert.match(byId.get("w-vienna-game-vienna-gambit").ideas, /3\.f4.*…d5/);
  assert.match(byId.get("w-vienna-gambit-with-max-lange-defense").ideas, /…Nc6.*f4/);
  assert.match(byId.get("w-ruy-lopez-exchange-variation").ideas, /Bxc6.*疊兵/);
  assert.match(byId.get("w-ruy-lopez-closed").ideas, /c3.*d4.*后翼/);
  assert.match(byId.get("b-petrovs-defense").ideas, /2…Nf6.*e4/);
  assert.match(byId.get("b-philidor-defense").ideas, /2…d6.*c8 象/);
  assert.match(byId.get("b-italian-game-two-knights-defense").ideas, /3…Nf6.*4\.Ng5.*…d5/);
  assert.match(byId.get("b-ruy-lopez-berlin-defense").ideas, /3…Nf6.*e4/);
  assert.match(byId.get("b-ruy-lopez-marshall-attack").ideas, /8…d5.*e4 兵/);
});

test("open-game gateways and gambit responses explain their actual positions", () => {
  const ids = [
    "w-dresden-opening",
    "w-irish-gambit",
    "w-kings-knight-opening",
    "w-kings-pawn-game",
    "w-kings-pawn-opening",
    "w-latvian-gambit-accepted",
    "b-center-game-accepted",
    "b-danish-gambit-accepted",
    "b-danish-gambit-declined",
    "b-gunderam-defense",
    "b-kings-gambit-accepted",
    "b-kings-gambit-declined",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-dresden-opening").ideas, /3\.c4.*Goblin.*4\.Nxe5/);
  assert.match(byId.get("w-irish-gambit").ideas, /3\.Nxe5.*…Nxe5.*d4/);
  assert.match(byId.get("w-kings-knight-opening").ideas, /2\.Nf3.*e5/);
  assert.match(byId.get("w-kings-pawn-game").ideas, /1\.e4 e5.*開放王兵/);
  assert.match(byId.get("w-kings-pawn-opening").ideas, /2\.b3.*Bb2/);
  assert.match(byId.get("w-latvian-gambit-accepted").ideas, /2…f5.*3\.exf5/);
  assert.match(byId.get("b-center-game-accepted").ideas, /2\.d4 exd4.*Qxd4/);
  assert.match(byId.get("b-danish-gambit-accepted").ideas, /3…dxc3.*雙兵/);
  assert.match(byId.get("b-danish-gambit-declined").ideas, /Sörensen.*3…d5/);
  assert.match(byId.get("b-gunderam-defense").ideas, /2…Qe7.*f8 象/);
  assert.match(byId.get("b-kings-gambit-accepted").ideas, /2…exf4.*…g5/);
  assert.match(byId.get("b-kings-gambit-declined").ideas, /Falkbeer.*Charousek.*2…d5/);
});

test("standalone gambits explain their own compensation and concrete risks", () => {
  const ids = [
    "w-kings-gambit",
    "w-danish-gambit",
    "w-blackmar-diemer-gambit",
    "b-latvian-gambit",
    "b-elephant-gambit",
    "b-englund-gambit",
    "b-duras-gambit",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);
  assert.ok(openings.every((opening) => !opening.ideas.includes("屬於非主流或趣味體系")));

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-kings-gambit").ideas, /2\.f4.*e5.*f 線|2\.f4.*f 線.*e5/);
  assert.match(byId.get("w-danish-gambit").ideas, /3\.c3.*dxc3.*Bc4.*Bxb2/);
  assert.match(byId.get("w-blackmar-diemer-gambit").ideas, /4\.f3.*exf3.*Nxf3/);
  assert.match(byId.get("b-latvian-gambit").ideas, /2…f5.*e4.*f3 馬/);
  assert.match(byId.get("b-elephant-gambit").ideas, /2…d5.*3\.exd5.*…e4/);
  assert.match(byId.get("b-englund-gambit").ideas, /2\.dxe5.*…Nc6.*…Qe7/);
  assert.match(byId.get("b-duras-gambit").ideas, /1…f5.*2\.exf5.*王翼/);
});

test("extreme first moves explain their square impact and recovery plan", () => {
  const ids = [
    "w-grob-opening",
    "w-ware-opening",
    "w-amar-opening",
    "w-bongcloud-attack",
    "w-amazon-attack",
    "w-barnes-opening",
    "w-clemenz-opening",
    "w-kadas-opening",
    "w-sodium-attack",
    "w-vant-kruijs-opening",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);
  assert.ok(openings.every((opening) => !opening.ideas.includes("屬於非主流或趣味體系")));

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-grob-opening").ideas, /1\.g4.*Bg2.*g4 兵/);
  assert.match(byId.get("w-ware-opening").ideas, /1\.a4.*b5.*中心/);
  assert.match(byId.get("w-amar-opening").ideas, /1\.Nh3.*f4.*f2/);
  assert.match(byId.get("w-bongcloud-attack").ideas, /2\.Ke2.*易位.*f1 象/);
  assert.match(byId.get("w-amazon-attack").ideas, /2\.Qd3.*e4.*h7/);
  assert.match(byId.get("w-barnes-opening").ideas, /1\.f3.*e4.*e1–h4/);
  assert.match(byId.get("w-clemenz-opening").ideas, /1\.h3.*g4.*中心/);
  assert.match(byId.get("w-kadas-opening").ideas, /1\.h4.*h5.*g3/);
  assert.match(byId.get("w-sodium-attack").ideas, /1\.Na3.*c4.*b5/);
  assert.match(byId.get("w-vant-kruijs-opening").ideas, /1\.e3.*d4.*f1 象/);
});

test("every former novelty template now teaches its actual formation", () => {
  const ids = [
    "w-amsterdam-attack",
    "w-basque-opening",
    "w-canard-opening",
    "w-creepy-crawly-formation",
    "w-formation",
    "w-global-opening",
    "w-lasker-simul-special",
    "w-paleface-attack",
    "w-portuguese-opening",
    "w-valencia-opening",
    "b-st-george-defense",
    "b-polish-defense",
    "b-hippopotamus-defense",
    "b-australian-defense",
    "b-barnes-defense",
    "b-borg-defense",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-amsterdam-attack").ideas, /e3.*c4.*b3.*Bb2/);
  assert.match(byId.get("w-basque-opening").ideas, /2\.b3.*Bb2.*d4 兵/);
  assert.match(byId.get("w-canard-opening").ideas, /2\.f4.*e5.*荷蘭/);
  assert.match(byId.get("w-creepy-crawly-formation").ideas, /1\.h3.*2\.a3.*…d5.*…e5/);
  assert.match(byId.get("w-formation").ideas, /a3.*g3.*Bg2.*d3.*e3/);
  assert.match(byId.get("w-global-opening").ideas, /1\.h3.*2\.a3.*Bg4.*Bb4/);
  assert.match(byId.get("w-lasker-simul-special").ideas, /1\.g3.*h5.*Bg2/);
  assert.match(byId.get("w-paleface-attack").ideas, /2\.f3.*e4.*f3 格/);
  assert.match(byId.get("w-portuguese-opening").ideas, /2\.Bb5.*c6.*d7/);
  assert.match(byId.get("w-valencia-opening").ideas, /1\.d3.*2\.Nd2.*e4.*c4/);
  assert.match(byId.get("b-st-george-defense").ideas, /1…a6.*…b5.*…Bb7/);
  assert.match(byId.get("b-polish-defense").ideas, /1\.d4 b5.*…Bb7.*g2/);
  assert.match(byId.get("b-hippopotamus-defense").ideas, /…Nh6.*…g6.*…f6/);
  assert.match(byId.get("b-australian-defense").ideas, /1\.d4 Na6.*c5.*b4/);
  assert.match(byId.get("b-barnes-defense").ideas, /1\.e4 f6.*e5.*h5–e8/);
  assert.match(byId.get("b-borg-defense").ideas, /1\.e4 g5.*…Bg7.*g5 兵/);
  assert.deepEqual(catalog.openings.filter((opening) => opening.ideas.includes("屬於非主流或趣味體系")), []);
});

test("queen-pawn systems explain their distinct setups and named branches", () => {
  const ids = [
    "w-london-system-with-bd3",
    "w-london-system-with-be2",
    "w-marienbad-system",
    "w-queens-pawn-game",
    "w-queens-pawn-mengarini-attack",
    "w-rapport-jobava-system-with-e6",
    "w-rubinstein-opening",
    "w-yusupov-rubinstein-system",
    "w-blackmar-diemer-gambit-accepted",
    "w-blackmar-diemer-gambit-declined",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-london-system-with-bd3").ideas, /Bd3.*h7.*e4/);
  assert.match(byId.get("w-london-system-with-be2").ideas, /h3.*Be2.*…c5/);
  assert.match(byId.get("w-marienbad-system").ideas, /g3.*Bg2.*…b6.*…c5/);
  assert.match(byId.get("w-queens-pawn-game").ideas, /1\.d4 d5 2\.e3.*c1 象/);
  assert.match(byId.get("w-queens-pawn-mengarini-attack").ideas, /3\.Qc2.*e4/);
  assert.match(byId.get("w-rapport-jobava-system-with-e6").ideas, /Nc3.*Bf4.*…e6.*e4/);
  assert.match(byId.get("w-rubinstein-opening").ideas, /Bd3.*b3.*Bb2/);
  assert.match(byId.get("w-yusupov-rubinstein-system").ideas, /Nf3.*e3.*c4|Nf3.*e3.*b3/);
  assert.match(byId.get("w-blackmar-diemer-gambit-accepted").ideas, /4\.f3 exf3.*Nxf3/);
  assert.match(byId.get("w-blackmar-diemer-gambit-declined").ideas, /Weinsbach.*Pfrang.*4…e6/);
});

test("unorthodox d4 defenses explain their concrete move-order tradeoffs", () => {
  const ids = [
    "b-horwitz-defense",
    "b-mikenas-defense",
    "b-wade-defense",
    "b-dory-defense",
    "b-englund-gambit-declined",
    "b-kangaroo-defense",
    "b-mexican-defense",
    "b-montevideo-defense",
    "b-pterodactyl-defense",
    "b-robatsch-defense",
    "b-vulture-defense",
    "b-zaire-defense",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("b-horwitz-defense").ideas, /1…e6.*法蘭西|1…e6.*后翼棄兵/);
  assert.match(byId.get("b-mikenas-defense").ideas, /1…Nc6.*c 兵/);
  assert.match(byId.get("b-wade-defense").ideas, /…d6.*…Bg4.*f3 馬/);
  assert.match(byId.get("b-dory-defense").ideas, /2…Ne4.*f3|2…Ne4.*f4/);
  assert.match(byId.get("b-englund-gambit-declined").ideas, /2\.d5.*…c6|2\.d5.*…Nf6/);
  assert.match(byId.get("b-kangaroo-defense").ideas, /2…Bb4\+.*Bogo/);
  assert.match(byId.get("b-mexican-defense").ideas, /2\.c4.*…Nc6.*d4.*c 兵/);
  assert.match(byId.get("b-montevideo-defense").ideas, /Nc6–b8|Nc6.*Nb8.*節奏/);
  assert.match(byId.get("b-pterodactyl-defense").ideas, /…g6.*…Bg7.*…Qa5\+/);
  assert.match(byId.get("b-robatsch-defense").ideas, /…g6.*…Bg7.*4…Bg4/);
  assert.match(byId.get("b-vulture-defense").ideas, /3\.d5.*…Ne4.*d5/);
  assert.match(byId.get("b-zaire-defense").ideas, /Nc6–b8.*Nf6–g8.*多個節奏/);
});

test("every remaining flank first move and e4 sideline has concrete teaching", () => {
  const ids = [
    "w-van-geet-opening",
    "w-hungarian-opening",
    "w-mieses-opening",
    "w-saragossa-opening",
    "w-anderssens-opening",
    "w-polish-opening-with-d5",
    "w-three-knights-opening",
    "b-czech-defense",
    "b-carr-defense",
    "b-fried-fox-defense",
    "b-goldsmith-defense",
    "b-lemming-defense",
    "b-lion-defense",
    "b-rat-defense",
    "b-ware-defense",
  ];
  const openings = ids.map((id) => catalog.openings.find((opening) => opening.id === id));
  assert.ok(openings.every(Boolean));
  assert.equal(new Set(openings.map((opening) => opening.ideas)).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.plans.join("|"))).size, ids.length);
  assert.equal(new Set(openings.map((opening) => opening.mistakes.join("|"))).size, ids.length);
  assert.deepEqual(
    catalog.openings.filter((opening) => opening.ideas.includes("以協調發展和中心控制進入可下的中局")),
    [],
  );

  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  assert.match(byId.get("w-van-geet-opening").ideas, /1\.Nc3.*d5.*e4.*c 兵/);
  assert.match(byId.get("w-hungarian-opening").ideas, /1\.g3.*Bg2/);
  assert.match(byId.get("w-mieses-opening").ideas, /1\.d3.*e4/);
  assert.match(byId.get("w-saragossa-opening").ideas, /1\.c3.*d4.*c3.*后馬/);
  assert.match(byId.get("w-anderssens-opening").ideas, /1\.a3.*b4.*中心/);
  assert.match(byId.get("w-polish-opening-with-d5").ideas, /1\.b4.*…d5.*Bb2/);
  assert.match(byId.get("w-three-knights-opening").ideas, /3\.Nc3.*3…Bb4.*Bxc3/);
  assert.match(byId.get("b-czech-defense").ideas, /3…c6.*…e5|3…c6.*…Qa5/);
  assert.match(byId.get("b-carr-defense").ideas, /1…h6.*中心.*節奏/);
  assert.match(byId.get("b-fried-fox-defense").ideas, /1…f6.*2…Kf7.*易位/);
  assert.match(byId.get("b-goldsmith-defense").ideas, /1…h5.*中心.*g5/);
  assert.match(byId.get("b-lemming-defense").ideas, /1…Na6.*b4.*c5/);
  assert.match(byId.get("b-lion-defense").ideas, /3…Nbd7.*…e5/);
  assert.match(byId.get("b-rat-defense").ideas, /…g6.*…d6.*3…c6/);
  assert.match(byId.get("b-ware-defense").ideas, /1…a5.*b4.*中心/);
});

test("transposition routes reach the exact same normalized FEN", () => {
  const data = buildExplorerData(catalog, variationCatalog);
  assert.equal(data.schema_version, 10);
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
  const map = buildMapData(catalog, variationCatalog);
  const data = buildExplorerData(catalog, variationCatalog);
  assert.ok(data.analogyGroups.length >= 6);
  const openingById = new Map(map.nodes.map((opening) => [opening.id, opening]));
  const sicilianEnglish = data.analogyGroups.find((group) => group.id === "sicilian-english-reversed");
  assert.ok(sicilianEnglish);
  assert.equal(sicilianEnglish.title, "西西里防禦 ↔ 英格蘭開局");
  assert.match(sicilianEnglish.summary, /反色西西里/);
  assert.equal(sicilianEnglish.relation, "reversed");
  assert.ok(sicilianEnglish.blackIds.includes("b-sicilian-defense"));
  assert.ok(sicilianEnglish.whiteIds.includes("w-english-opening"));
  assert.ok(sicilianEnglish.whiteIds.every((id) => openingById.get(id)?.title_zh.startsWith("英格蘭開局")));
  assert.ok(!map.nodes.some((opening) => opening.title_zh.includes("英國式開局")));

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
