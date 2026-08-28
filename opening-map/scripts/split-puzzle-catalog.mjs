import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("data/notion-puzzles-source.json");
const indexPath = resolve("public/notion-puzzles.json");
const detailsDirectory = resolve("public/notion-puzzle-details");
const chunkSize = 256;
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

if (!Array.isArray(source.puzzles) || source.count !== source.puzzles.length) {
  throw new Error("Puzzle source count does not match its puzzle array");
}

mkdirSync(detailsDirectory, { recursive: true });
for (const name of readdirSync(detailsDirectory)) {
  if (/^chunk-\d{3}\.json$/.test(name)) rmSync(resolve(detailsDirectory, name));
}

const summaries = source.puzzles.map((puzzle, index) => ({
  id: puzzle.id,
  title: puzzle.title,
  side: puzzle.side,
  themes: puzzle.themes,
  difficulty: puzzle.difficulty,
  classification: puzzle.classification,
  deltaCp: puzzle.deltaCp,
  stage: puzzle.stage,
  dueAt: puzzle.dueAt,
  chunk: Math.floor(index / chunkSize),
}));

const detailFields = [
  "id", "fen", "previousFen", "previousMove", "wrongMove", "answerUci", "answerSan",
  "solutionLine", "answerEngine", "engineDepth", "attempts", "accuracy", "notionUrl", "gameUrl",
];

for (let offset = 0; offset < source.puzzles.length; offset += chunkSize) {
  const chunk = offset / chunkSize;
  const puzzles = source.puzzles.slice(offset, offset + chunkSize).map((puzzle) => Object.fromEntries(
    detailFields.map((field) => [field, puzzle[field]]),
  ));
  const filename = `chunk-${String(chunk).padStart(3, "0")}.json`;
  writeFileSync(resolve(detailsDirectory, filename), `${JSON.stringify({
    schemaVersion: 2,
    exportedAt: source.exportedAt,
    chunk,
    puzzles,
  })}\n`);
}

writeFileSync(indexPath, `${JSON.stringify({
  schemaVersion: 2,
  source: source.source,
  exportedAt: source.exportedAt,
  count: source.count,
  chunkSize,
  detailBase: "notion-puzzle-details",
  puzzles: summaries,
})}\n`);

console.log(`Split ${source.count} puzzles into ${Math.ceil(source.count / chunkSize)} on-demand detail chunks`);
