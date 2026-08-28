import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";

const source = JSON.parse(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url), "utf8"));
const indexBytes = readFileSync(new URL("../public/notion-puzzles.json", import.meta.url));
const index = JSON.parse(indexBytes);

function decodeSummary(record, chunk) {
  const [id, title, side, themes, difficulty, classification, deltaCp, stage] = record;
  return {
    id,
    title: index.dictionaries.titles[title],
    side: index.dictionaries.sides[side],
    themes: themes.map((themeIndex) => index.dictionaries.themes[themeIndex]),
    difficulty: index.dictionaries.difficulties[difficulty],
    classification: index.dictionaries.classifications[classification],
    deltaCp,
    stage,
    chunk,
  };
}

function groupMask(puzzle) {
  const labels = `${puzzle.title} ${puzzle.themes.join(" ")} ${puzzle.classification}`;
  const round = Number(puzzle.title.match(/第\s*(\d+)\s*回合/)?.[1] ?? 0);
  return [
    true,
    /開局/.test(labels) || (round > 0 && round <= 12),
    /中局/.test(labels) || (round > 12 && round < 40 && !/殘局/.test(labels)),
    /殘局/.test(labels) || round >= 40,
    /進攻|攻擊|戰術|犧牲|將殺/.test(labels),
    /防守|防禦/.test(labels),
    /blunder|重大失誤/.test(labels),
  ].reduce((mask, matches, position) => matches ? mask | (1 << position) : mask, 0);
}

test("puzzle metadata keeps the first render tiny and excludes board positions and answers", () => {
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.count, source.count);
  assert.equal(index.chunkSize, 256);
  assert.equal(index.initialSummaryPath, "notion-puzzle-summaries/chunk-000.json");
  assert.equal(index.searchPath, "notion-puzzle-search.json");
  assert.equal(index.detailBase, "notion-puzzle-details");
  assert.equal("puzzles" in index, false);
  assert.deepEqual(Object.keys(index.dictionaries), ["titles", "sides", "themes", "difficulties", "classifications"]);
  assert.equal(index.groupCounts.length, 7);
  assert.equal(index.groupCounts[0], source.count);
  assert.ok(index.dueSchedule.length > 0);
  assert.equal(index.dueSchedule.reduce((count, [, scheduled]) => count + scheduled, 0), source.count);
  assert.ok(index.dueSchedule.every(([date, scheduled]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && scheduled > 0));
  const initial = JSON.parse(readFileSync(new URL(`../public/${index.initialSummaryPath}`, import.meta.url), "utf8"));
  assert.equal(initial.schemaVersion, 3);
  assert.equal(initial.exportedAt, index.exportedAt);
  assert.equal(initial.chunk, 0);
  assert.equal(initial.puzzles.length, index.chunkSize);
  assert.deepEqual(initial.puzzles[0], JSON.parse(readFileSync(new URL("../public/notion-puzzle-search.json", import.meta.url), "utf8")).puzzles[0]);
});

test("on-demand summary and detail chunks reconstruct every puzzle without loss", () => {
  const search = JSON.parse(readFileSync(new URL("../public/notion-puzzle-search.json", import.meta.url), "utf8"));
  assert.equal(search.schemaVersion, 3);
  assert.equal(search.exportedAt, index.exportedAt);
  const summaries = search.puzzles.map((record, position) => decodeSummary(record, Math.floor(position / index.chunkSize)));
  const details = [];
  const detailChunkCount = Math.ceil(index.count / index.chunkSize);
  for (let chunk = 0; chunk < detailChunkCount; chunk += 1) {
    const label = String(chunk).padStart(3, "0");
    const detail = JSON.parse(readFileSync(new URL(`../public/notion-puzzle-details/chunk-${label}.json`, import.meta.url), "utf8"));
    assert.equal(detail.schemaVersion, 2);
    assert.equal(detail.exportedAt, index.exportedAt);
    assert.equal(detail.chunk, chunk);
    assert.ok(detail.puzzles.length > 0 && detail.puzzles.length <= index.chunkSize);
    details.push(...detail.puzzles);
  }
  assert.equal(summaries.length, source.count);
  assert.equal(details.length, source.count);
  assert.equal(new Set(summaries.map((puzzle) => puzzle.id)).size, source.count);
  assert.deepEqual(index.groupCounts, Array.from({ length: 7 }, (_, groupIndex) => summaries
    .filter((puzzle) => groupMask(puzzle) & (1 << groupIndex)).length));
  for (let position = 0; position < source.puzzles.length; position += 1) {
    const original = source.puzzles[position];
    const summary = summaries[position];
    const detail = details[position];
    assert.deepEqual(summary, {
      id: original.id,
      title: original.title,
      side: original.side,
      themes: original.themes,
      difficulty: original.difficulty,
      classification: original.classification,
      deltaCp: original.deltaCp,
      stage: original.stage,
      chunk: Math.floor(position / index.chunkSize),
    });
    assert.equal(detail.id, original.id);
    assert.equal(detail.fen, original.fen);
    assert.equal(detail.answerUci, original.answerUci);
    assert.deepEqual(detail.solutionLine, original.solutionLine);
  }
});

test("opening the puzzle browser transfers less than two percent of the former monolith", () => {
  const firstSummary = readFileSync(new URL("../public/notion-puzzle-summaries/chunk-000.json", import.meta.url));
  const firstDetail = readFileSync(new URL("../public/notion-puzzle-details/chunk-000.json", import.meta.url));
  const initialCompressed = gzipSync(indexBytes).length + gzipSync(firstSummary).length + gzipSync(firstDetail).length;
  const monolithCompressed = gzipSync(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url))).length;
  assert.ok(initialCompressed < monolithCompressed * 0.02, `${initialCompressed} should be less than 2% of ${monolithCompressed}`);
});
