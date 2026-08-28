import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("../src/Chessboard.tsx", import.meta.url), "utf8");

test("a primary pointer press clears attack arrows before click or drag completes", () => {
  assert.match(board, /onPointerDown=\{\(event\) => \{\s*if \(event\.button === 0\) \{\s*if \(arrows\.length\) setArrows\(\[\]\);\s*return;/);
  assert.match(board, /if \(event\.button === 2\) \{ event\.preventDefault\(\); arrowStart\.current = square; \}/);
  assert.match(board, /function movePiece[\s\S]*if \(arrows\.length\) setArrows\(\[\]\)/);
});
