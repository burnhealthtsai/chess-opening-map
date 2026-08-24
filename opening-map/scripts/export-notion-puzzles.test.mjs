import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Chess } from "chess.js";

test("Notion puzzle export contains synced prompts without public solutions", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/notion-puzzles.json", import.meta.url), "utf8"));
  assert.equal(catalog.source, "Notion · 個人西洋棋謎題");
  assert.equal(catalog.count, catalog.puzzles.length);
  assert.ok(catalog.count > 0);
  for (const puzzle of catalog.puzzles.slice(0, 100)) {
    assert.match(puzzle.id, /^p-/);
    assert.ok(puzzle.fen.split(" ").length >= 4);
    assert.match(puzzle.notionUrl, /^https:\/\/app\.notion\.com\//);
    assert.equal("solution" in puzzle, false);
    assert.equal("candidates" in puzzle, false);
  }
});

test("synced puzzles replay the opponent's previous move into the puzzle position", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/notion-puzzles.json", import.meta.url), "utf8"));
  const animated = catalog.puzzles.filter((puzzle) => puzzle.previousFen && puzzle.previousMove);
  assert.ok(animated.length > 0, "expected puzzles with a verified previous move");
  assert.ok(animated.length >= Math.floor(catalog.count * 0.8), "most puzzles should include a verified previous move");
  for (const puzzle of animated.slice(0, 500)) {
    const game = new Chess(puzzle.previousFen);
    const result = game.move(puzzle.previousMove);
    assert.ok(result, `${puzzle.id} previous move must be legal`);
    assert.equal(game.fen().split(" ").slice(0, 4).join(" "), puzzle.fen.split(" ").slice(0, 4).join(" "), `${puzzle.id} previous move must reach the puzzle FEN`);
  }
});
