import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("data/notion-puzzles-source.json");
const indexPath = resolve("public/notion-puzzles.json");
const searchPath = resolve("public/notion-puzzle-search.json");
const summariesDirectory = resolve("public/notion-puzzle-summaries");
const detailsDirectory = resolve("public/notion-puzzle-details");
const chunkSize = 256;
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

if (!Array.isArray(source.puzzles) || source.count !== source.puzzles.length) {
  throw new Error("Puzzle source count does not match its puzzle array");
}

for (const directory of [summariesDirectory, detailsDirectory]) {
  mkdirSync(directory, { recursive: true });
  for (const name of readdirSync(directory)) {
    if (/^chunk-\d{3}\.json$/.test(name)) rmSync(resolve(directory, name));
  }
}

const unique = (values) => [...new Set(values)];
const dictionaries = {
  titles: unique(source.puzzles.map((puzzle) => puzzle.title)),
  sides: unique(source.puzzles.map((puzzle) => puzzle.side)),
  themes: unique(source.puzzles.flatMap((puzzle) => puzzle.themes)),
  difficulties: unique(source.puzzles.map((puzzle) => puzzle.difficulty)),
  classifications: unique(source.puzzles.map((puzzle) => puzzle.classification)),
};
const dictionaryIndex = Object.fromEntries(Object.entries(dictionaries).map(([key, values]) => [
  key,
  new Map(values.map((value, index) => [value, index])),
]));
const puzzleGroupMask = (puzzle) => {
  const labels = `${puzzle.title} ${puzzle.themes.join(" ")} ${puzzle.classification}`;
  const round = Number(puzzle.title.match(/第\s*(\d+)\s*回合/)?.[1] ?? 0);
  const matches = [
    true,
    /開局/.test(labels) || (round > 0 && round <= 12),
    /中局/.test(labels) || (round > 12 && round < 40 && !/殘局/.test(labels)),
    /殘局/.test(labels) || round >= 40,
    /進攻|攻擊|戰術|犧牲|將殺/.test(labels),
    /防守|防禦/.test(labels),
    /blunder|重大失誤/.test(labels),
  ];
  return matches.reduce((mask, match, index) => match ? mask | (1 << index) : mask, 0);
};
const groupCounts = Array.from({ length: 7 }, (_, groupIndex) => source.puzzles
  .filter((puzzle) => puzzleGroupMask(puzzle) & (1 << groupIndex)).length);
const dueSchedule = Object.entries(source.puzzles.reduce((schedule, puzzle) => {
  const date = puzzle.dueAt.slice(0, 10);
  schedule[date] = (schedule[date] ?? 0) + 1;
  return schedule;
}, {})).sort(([left], [right]) => left.localeCompare(right));

const packSummary = (puzzle) => [
  puzzle.id,
  dictionaryIndex.titles.get(puzzle.title),
  dictionaryIndex.sides.get(puzzle.side),
  puzzle.themes.map((theme) => dictionaryIndex.themes.get(theme)),
  dictionaryIndex.difficulties.get(puzzle.difficulty),
  dictionaryIndex.classifications.get(puzzle.classification),
  puzzle.deltaCp,
  puzzle.stage,
];

const packedSummaries = source.puzzles.map(packSummary);
writeFileSync(resolve(summariesDirectory, "chunk-000.json"), `${JSON.stringify({
  schemaVersion: 3,
  exportedAt: source.exportedAt,
  chunk: 0,
  puzzles: packedSummaries.slice(0, chunkSize),
})}\n`);
writeFileSync(searchPath, `${JSON.stringify({
  schemaVersion: 3,
  exportedAt: source.exportedAt,
  puzzles: packedSummaries,
})}\n`);

const detailFields = [
  "id", "fen", "previousFen", "previousMove", "wrongMove", "answerUci", "answerSan",
  "solutionLine", "answerEngine", "engineDepth", "attempts", "accuracy", "notionUrl", "gameUrl",
];

for (let offset = 0; offset < source.puzzles.length; offset += chunkSize) {
  const chunk = offset / chunkSize;
  const sourceChunk = source.puzzles.slice(offset, offset + chunkSize);
  const puzzles = sourceChunk.map((puzzle) => Object.fromEntries(
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
  schemaVersion: 3,
  source: source.source,
  exportedAt: source.exportedAt,
  count: source.count,
  chunkSize,
  initialSummaryPath: "notion-puzzle-summaries/chunk-000.json",
  searchPath: "notion-puzzle-search.json",
  detailBase: "notion-puzzle-details",
  dictionaries,
  groupCounts,
  dueSchedule,
})}\n`);

console.log(`Split ${source.count} puzzles into a progressive search index and ${Math.ceil(source.count / chunkSize)} detail chunks`);
