import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const puzzles = readFileSync(new URL("../src/PuzzleExplorer.tsx", import.meta.url), "utf8");

test("puzzle index and detail chunks are deduplicated for the browser session", () => {
  assert.match(puzzles, /let cachedCatalog: NotionPuzzleCatalog \| null = null/);
  assert.match(puzzles, /let catalogRequest: Promise<NotionPuzzleCatalog> \| null = null/);
  assert.match(puzzles, /if \(cachedCatalog\) return Promise\.resolve\(cachedCatalog\)/);
  assert.match(puzzles, /if \(catalogRequest\) return catalogRequest/);
  assert.match(puzzles, /const detailChunkRequests = new Map<string, Promise<PuzzleDetailChunk>>\(\)/);
  assert.match(puzzles, /if \(existing\) return existing/);
  assert.match(puzzles, /detailChunkRequests\.delete\(key\)/);
});

test("puzzle view state survives tab changes while analysis remains opt-in", () => {
  assert.match(puzzles, /let puzzleViewState: PuzzleViewState =/);
  assert.match(puzzles, /useState\(puzzleViewState\.query\)/);
  assert.match(puzzles, /useState<PuzzleGroup>\(puzzleViewState\.group\)/);
  assert.match(puzzles, /useState\(puzzleViewState\.page\)/);
  assert.match(puzzles, /useState<string \| null>\(puzzleViewState\.selectedId\)/);
  assert.match(puzzles, /puzzleViewState = \{ query: puzzleQuery, side, theme, difficulty, group, page, selectedId \}/);
  assert.match(puzzles, /const \[showStockfish, setShowStockfish\] = useState\(false\)/);
  assert.match(puzzles, /const \[showAnswer, setShowAnswer\] = useState\(false\)/);
});

test("failed puzzle index requests expose an in-place retry", () => {
  assert.match(puzzles, /className="empty" role="alert"/);
  assert.match(puzzles, /重新載入謎題/);
  assert.match(puzzles, /setCatalogRetry\(\(value\) => value \+ 1\)/);
  assert.match(puzzles, /catalogRequest = null/);
});
