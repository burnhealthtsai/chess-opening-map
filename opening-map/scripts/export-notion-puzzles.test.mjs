import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Chess } from "chess.js";

test("Notion puzzle export contains legal Stockfish-verified answers", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url), "utf8"));
  assert.equal(catalog.source, "Notion · 個人西洋棋謎題");
  assert.equal(catalog.count, catalog.puzzles.length);
  assert.ok(catalog.count > 0);
  for (const puzzle of catalog.puzzles) {
    assert.match(puzzle.id, /^p-/);
    assert.ok(puzzle.fen.split(" ").length >= 4);
    assert.match(puzzle.notionUrl, /^https:\/\/app\.notion\.com\//);
    assert.match(puzzle.answerUci, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
    assert.ok(puzzle.answerSan);
    assert.equal(puzzle.engineDepth, 14);
    assert.equal(puzzle.answerEngine, "Stockfish 18 Lite 18.0.8");
    assert.ok(Array.isArray(puzzle.solutionLine));
    assert.ok(puzzle.solutionLine.length >= 1);
    assert.equal(puzzle.solutionLine[0], puzzle.answerSan);
    assert.notEqual(puzzle.wrongMove.replace(/[+#?!]+$/g, ""), puzzle.answerSan.replace(/[+#?!]+$/g, ""), `${puzzle.id} 的錯著不得同時是最佳棋`);
    const game = new Chess(puzzle.fen);
    const first = game.move({ from: puzzle.answerUci.slice(0, 2), to: puzzle.answerUci.slice(2, 4), promotion: puzzle.answerUci[4] || "q" });
    assert.equal(first.san, puzzle.answerSan, `${puzzle.id} 的 SAN 與 UCI 解答必須一致`);
    const replay = new Chess(puzzle.fen);
    for (const san of puzzle.solutionLine) assert.doesNotThrow(() => replay.move(san), `${puzzle.id} 的 Stockfish 延伸棋路必須合法`);
  }
});

test("synced puzzles replay the opponent's previous move into the puzzle position", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/notion-puzzles-source.json", import.meta.url), "utf8"));
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
