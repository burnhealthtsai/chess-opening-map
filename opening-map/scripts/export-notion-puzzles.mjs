import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Chess } from "chess.js";

const defaultDb = "/Users/ferociyyy/Documents/西洋棋計畫/data/chess.sqlite";
const database = process.env.CHESS_PUZZLE_DB || defaultDb;
const output = resolve("data/notion-puzzles-source.json");
const answerEngine = "Stockfish 18 Lite 18.0.8";
const existingAnswers = new Map();

if (existsSync(output)) {
  try {
    const existing = JSON.parse(readFileSync(output, "utf8"));
    for (const puzzle of existing.puzzles || []) existingAnswers.set(puzzle.id, puzzle);
  } catch { /* A damaged cache must not block a clean database export. */ }
}

if (!existsSync(database)) {
  throw new Error(`找不到西洋棋謎題資料庫：${database}`);
}

const query = `
  SELECT p.id, p.fen, p.user_color, p.classification, p.difficulty,
         p.delta_cp, p.source_ply, p.themes_json, p.wrong_san, p.wrong_uci,
         p.solution_json, p.candidates_json, p.engine_kind, p.engine_depth,
         p.notion_page_id, pr.stage, pr.due_at, pr.total_attempts,
         pr.correct_attempts, p.game_uuid, g.url AS game_url, g.pgn AS game_pgn
  FROM puzzles p
  JOIN puzzle_progress pr ON pr.puzzle_id = p.id
  JOIN games g ON g.uuid = p.game_uuid
  WHERE p.active = 1 AND p.notion_page_id IS NOT NULL
    AND p.wrong_uci <> json_extract(p.solution_json, '$[0]')
  ORDER BY datetime(pr.due_at) ASC, p.delta_cp DESC, p.id ASC;
`;

const raw = execFileSync("sqlite3", ["-json", database, query], {
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});
const rows = JSON.parse(raw || "[]");
const gameTimelines = new Map();
const puzzles = rows.map((row) => {
  const themes = safeJsonArray(row.themes_json);
  const round = Math.max(1, Math.ceil(Number(row.source_ply || 1) / 2));
  const notionId = String(row.notion_page_id || "").replaceAll("-", "");
  const attempts = Number(row.total_attempts || 0);
  const correct = Number(row.correct_attempts || 0);
  const previous = previousMoveContext(row.game_uuid, row.game_pgn, Number(row.source_ply || 0), row.fen);
  const solutionUci = safeJsonArray(row.solution_json);
  if (row.engine_kind !== "stockfish" || Number(row.engine_depth) !== 14) throw new Error(`${row.id}: 解答不是統一的 Stockfish 深度 14`);
  if (!solutionUci.length) throw new Error(`${row.id}: 缺少 Stockfish 解答`);
  const solutionLine = solutionSanLine(row.fen, solutionUci);
  const candidates = safeJsonArray(row.candidates_json);
  const primaryCandidate = candidates[0] && typeof candidates[0] === "object" ? candidates[0] : null;
  if (primaryCandidate?.uci && primaryCandidate.uci !== solutionUci[0]) throw new Error(`${row.id}: 候選解與主解不一致`);
  const cached = existingAnswers.get(row.id);
  const useCached = cached?.fen === row.fen && cached.answerEngine === answerEngine && cached.engineDepth === 14
    && cached.answerUci && cached.answerSan && Array.isArray(cached.solutionLine) && cached.solutionLine.length;
  return {
    id: row.id,
    title: `第 ${round} 回合 · ${themes[0] || "找出最佳棋步"}`,
    fen: row.fen,
    previousFen: previous.fen,
    previousMove: previous.move,
    side: row.user_color === "black" ? "黑方" : "白方",
    themes,
    difficulty: row.difficulty,
    classification: row.classification,
    deltaCp: Number(row.delta_cp || 0),
    wrongMove: row.wrong_san || "",
    answerUci: useCached ? cached.answerUci : solutionUci[0],
    answerSan: useCached ? cached.answerSan : solutionLine[0],
    solutionLine: useCached ? cached.solutionLine : solutionLine,
    answerEngine: useCached ? answerEngine : String(row.engine_kind || "legacy-stockfish"),
    engineDepth: Number(row.engine_depth),
    stage: Number(row.stage || 0),
    dueAt: row.due_at,
    attempts,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    notionUrl: `https://app.notion.com/${notionId}`,
    gameUrl: row.game_url || "",
  };
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ source: "Notion · 個人西洋棋謎題", exportedAt: new Date().toISOString(), count: puzzles.length, puzzles })}\n`);
console.log(`Exported ${puzzles.length} Notion puzzles to ${output}`);

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function solutionSanLine(fen, moves) {
  const game = new Chess(fen);
  return moves.map((uci) => {
    const value = String(uci);
    const move = game.move({ from: value.slice(0, 2), to: value.slice(2, 4), promotion: value[4] || "q" });
    if (!move) throw new Error(`非法 Stockfish 解答 ${value}`);
    return move.san;
  });
}

function previousMoveContext(gameId, pgn, sourcePly, expectedFen) {
  if (!pgn || sourcePly < 2) return { fen: "", move: "" };
  try {
    let timeline = gameTimelines.get(gameId);
    if (!timeline) {
      const parsed = new Chess();
      parsed.loadPgn(pgn);
      const moves = parsed.history();
      const replay = new Chess();
      const beforeFens = moves.map((move) => {
        const fen = replay.fen();
        replay.move(move);
        return fen;
      });
      timeline = { moves, beforeFens };
      gameTimelines.set(gameId, timeline);
    }
    const previousIndex = sourcePly - 2;
    const previousMove = timeline.moves[previousIndex];
    if (!previousMove) return { fen: "", move: "" };
    const previousFen = timeline.beforeFens[previousIndex];
    const verification = new Chess(previousFen);
    verification.move(previousMove);
    const expectedPosition = String(expectedFen || "").split(" ").slice(0, 4).join(" ");
    const actualPosition = verification.fen().split(" ").slice(0, 4).join(" ");
    return expectedPosition && expectedPosition !== actualPosition ? { fen: "", move: "" } : { fen: previousFen, move: previousMove };
  } catch {
    return { fen: "", move: "" };
  }
}
