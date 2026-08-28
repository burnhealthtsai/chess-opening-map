import { spawn } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { Chess } from "chess.js";

const catalogPath = resolve("public/notion-puzzles.json");
const temporaryPath = `${catalogPath}.tmp`;
const enginePath = resolve("node_modules/stockfish/bin/stockfish-18-lite-single.js");
const answerEngine = "Stockfish 18 Lite 18.0.8";
const engineDepth = 14;
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const allPending = catalog.puzzles.filter((puzzle) => puzzle.answerEngine !== answerEngine || puzzle.engineDepth !== engineDepth);
const diagnosticLimit = Number(process.env.PUZZLE_ENGINE_LIMIT || 0);
const pending = diagnosticLimit > 0 ? allPending.slice(0, diagnosticLimit) : allPending;

async function refresh() {
if (!pending.length) {
  const removed = removeInvalidPuzzles();
  if (removed) saveCatalog();
  console.log(`All ${catalog.count} puzzle answers already match ${answerEngine} depth ${engineDepth}; removed ${removed} puzzles whose alleged mistake is the best move`);
  process.exit(0);
}

const requestedWorkers = Number(process.env.PUZZLE_ENGINE_WORKERS || 0);
const workerCount = Math.max(1, Math.min(pending.length, requestedWorkers || Math.min(8, Math.max(2, availableParallelism() - 1))));
let cursor = 0;
let completed = 0;
console.log(`Refreshing ${pending.length} puzzle answers with ${answerEngine} depth ${engineDepth} using ${workerCount} workers`);

const engines = await Promise.all(Array.from({ length: workerCount }, () => UciEngine.create()));
await Promise.all(engines.map(async (engine) => {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= pending.length) break;
    const puzzle = pending[index];
    const analysis = await engine.analyze(puzzle.fen);
    const line = sanLine(puzzle.fen, analysis.pv.length ? analysis.pv : [analysis.bestMove]);
    puzzle.answerUci = analysis.bestMove;
    puzzle.answerSan = line[0];
    puzzle.solutionLine = line;
    puzzle.answerEngine = answerEngine;
    puzzle.engineDepth = engineDepth;
    completed += 1;
    if (completed % 250 === 0 || completed === pending.length) {
      saveCatalog();
      console.log(`Verified ${completed}/${pending.length}`);
    }
  }
  engine.close();
}));

const removed = removeInvalidPuzzles();
saveCatalog();
console.log(`Updated ${pending.length} answers and removed ${removed} invalid puzzles in ${catalogPath}`);
}

function removeInvalidPuzzles() {
  const before = catalog.puzzles.length;
  catalog.puzzles = catalog.puzzles.filter((puzzle) => normalizeSan(puzzle.wrongMove) !== normalizeSan(puzzle.answerSan));
  catalog.count = catalog.puzzles.length;
  return before - catalog.count;
}

function normalizeSan(move) {
  return String(move || "").replace(/[+#?!]+$/g, "");
}

function saveCatalog() {
  writeFileSync(temporaryPath, `${JSON.stringify(catalog)}\n`);
  renameSync(temporaryPath, catalogPath);
}

function sanLine(fen, moves) {
  const game = new Chess(fen);
  const result = [];
  for (const raw of moves) {
    const uci = String(raw);
    try {
      result.push(game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" }).san);
    } catch {
      if (!result.length) throw new Error(`Illegal Stockfish answer ${uci} for ${fen}`);
      break;
    }
  }
  return result;
}

class UciEngine {
  constructor(process) {
    this.process = process;
    this.buffer = "";
    this.waiters = [];
    this.latestPv = [];
    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk) => this.consume(chunk));
  }

  static async create() {
    const child = spawn(process.execPath, [enginePath], { stdio: ["pipe", "pipe", "inherit"] });
    const engine = new UciEngine(child);
    engine.send("uci");
    await engine.waitFor((line) => line === "uciok");
    engine.send("isready");
    await engine.waitFor((line) => line === "readyok");
    return engine;
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      const pv = line.match(/\bpv\s+((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/)?.[1];
      if (pv) this.latestPv = pv.trim().split(/\s+/);
      const index = this.waiters.findIndex(({ match }) => match(line));
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(line);
    }
  }

  send(command) { this.process.stdin.write(`${command}\n`); }

  waitFor(match) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Stockfish response timeout")), 120000);
      this.waiters.push({ match, resolve: (line) => { clearTimeout(timer); resolve(line); } });
    });
  }

  async analyze(fen) {
    this.latestPv = [];
    this.send("ucinewgame");
    this.send("setoption name Clear Hash");
    this.send("isready");
    await this.waitFor((line) => line === "readyok");
    this.send(`position fen ${fen}`);
    this.send(`go depth ${engineDepth}`);
    const line = await this.waitFor((value) => value.startsWith("bestmove "));
    const bestMove = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
    if (!bestMove) throw new Error(`Stockfish returned no move for ${fen}`);
    const pv = this.latestPv[0] === bestMove ? this.latestPv : [bestMove];
    return { bestMove, pv };
  }

  close() { this.send("quit"); }
}

await refresh();
