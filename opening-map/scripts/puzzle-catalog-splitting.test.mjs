import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";

const source = JSON.parse(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url), "utf8"));
const indexBytes = readFileSync(new URL("../public/notion-puzzles.json", import.meta.url));
const index = JSON.parse(indexBytes);

test("puzzle search index excludes board positions and answers", () => {
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.count, source.count);
  assert.equal(index.puzzles.length, source.puzzles.length);
  assert.equal(index.chunkSize, 256);
  assert.equal(index.detailBase, "notion-puzzle-details");
  for (const puzzle of index.puzzles) {
    assert.deepEqual(Object.keys(puzzle), ["id", "title", "side", "themes", "difficulty", "classification", "deltaCp", "stage", "dueAt", "chunk"]);
    assert.equal("fen" in puzzle, false);
    assert.equal("answerSan" in puzzle, false);
    assert.equal("notionUrl" in puzzle, false);
  }
});

test("on-demand chunks reconstruct every puzzle without loss", () => {
  const reconstructed = [];
  const chunkCount = Math.ceil(index.count / index.chunkSize);
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const filename = `../public/notion-puzzle-details/chunk-${String(chunk).padStart(3, "0")}.json`;
    const detail = JSON.parse(readFileSync(new URL(filename, import.meta.url), "utf8"));
    assert.equal(detail.schemaVersion, 2);
    assert.equal(detail.exportedAt, index.exportedAt);
    assert.equal(detail.chunk, chunk);
    assert.ok(detail.puzzles.length > 0 && detail.puzzles.length <= index.chunkSize);
    reconstructed.push(...detail.puzzles);
  }
  assert.equal(reconstructed.length, source.count);
  assert.equal(new Set(reconstructed.map((puzzle) => puzzle.id)).size, source.count);
  assert.equal(new Set(index.puzzles.map((puzzle) => puzzle.id)).size, source.count);
  for (let indexPosition = 0; indexPosition < source.puzzles.length; indexPosition += 1) {
    const original = source.puzzles[indexPosition];
    const summary = index.puzzles[indexPosition];
    const detail = reconstructed[indexPosition];
    assert.equal(summary.id, original.id);
    assert.equal(detail.id, original.id);
    assert.equal(detail.fen, original.fen);
    assert.equal(detail.answerUci, original.answerUci);
    assert.deepEqual(detail.solutionLine, original.solutionLine);
  }
});

test("opening the puzzle browser transfers less than one quarter of the former monolith", () => {
  const firstChunk = readFileSync(new URL("../public/notion-puzzle-details/chunk-000.json", import.meta.url));
  const initialCompressed = gzipSync(indexBytes).length + gzipSync(firstChunk).length;
  const monolithCompressed = gzipSync(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url))).length;
  assert.ok(initialCompressed < monolithCompressed * 0.25, `${initialCompressed} should be less than 25% of ${monolithCompressed}`);
});
