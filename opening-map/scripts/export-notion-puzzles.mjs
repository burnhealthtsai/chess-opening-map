import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Chess } from "chess.js";

const defaultDb = "/Users/ferociyyy/Documents/西洋棋計畫/data/chess.sqlite";
const database = process.env.CHESS_PUZZLE_DB || defaultDb;
const output = resolve("public/notion-puzzles.json");

if (!existsSync(database)) {
  throw new Error(`找不到西洋棋謎題資料庫：${database}`);
}

const query = `
  SELECT p.id, p.fen, p.user_color, p.classification, p.difficulty,
         p.delta_cp, p.source_ply, p.themes_json, p.wrong_san,
         p.notion_page_id, pr.stage, pr.due_at, pr.total_attempts,
         pr.correct_attempts, p.game_uuid, g.url AS game_url, g.pgn AS game_pgn
  FROM puzzles p
  JOIN puzzle_progress pr ON pr.puzzle_id = p.id
  JOIN games g ON g.uuid = p.game_uuid
  WHERE p.active = 1 AND p.notion_page_id IS NOT NULL
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
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function previousMoveContext(gameId, pgn, sourcePly, expectedFen) {
  if (!pgn || sourcePly < 2) return { fen: "", move: "" };
  try {
    let timeline = gameTimelines.get(gameId);
    if (!timeline) {
      const parsed = new Chess();
      parsed.loadPgn(pgn);
      timeline = parsed.history();
      gameTimelines.set(gameId, timeline);
    }
    const previousIndex = sourcePly - 2;
    const previousMove = timeline[previousIndex];
    if (!previousMove) return { fen: "", move: "" };
    const before = new Chess();
    for (const san of timeline.slice(0, previousIndex)) before.move(san);
    const previousFen = before.fen();
    const verification = new Chess(previousFen);
    verification.move(previousMove);
    const expectedPosition = String(expectedFen || "").split(" ").slice(0, 4).join(" ");
    const actualPosition = verification.fen().split(" ").slice(0, 4).join(" ");
    return expectedPosition && expectedPosition !== actualPosition ? { fen: "", move: "" } : { fen: previousFen, move: previousMove };
  } catch {
    return { fen: "", move: "" };
  }
}
