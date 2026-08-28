import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Chess } from "chess.js";

const lessonsUrl = new URL("../src/tacticLessons.json", import.meta.url);

function movesFromLine(line) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

test("每個戰術與技巧都有可重播的合法範例", async () => {
  const lessons = JSON.parse(await readFile(lessonsUrl, "utf8"));
  assert.ok(Array.isArray(lessons));
  assert.ok(lessons.filter(({ group }) => group === "戰術").length >= 5);
  assert.ok(lessons.filter(({ group }) => group === "技巧").length >= 4);
  assert.equal(new Set(lessons.map(({ title }) => title)).size, lessons.length, "標題不得重複");

  for (const lesson of lessons) {
    assert.match(lesson.example, /例如/ , `${lesson.title} 需有具體範例`);
    assert.equal(lesson.steps.length, 3, `${lesson.title} 需有三個辨識步驟`);
    assert.ok(lesson.exampleLine, `${lesson.title} 缺少範例棋路`);

    const game = new Chess(lesson.exampleFen);
    const moves = movesFromLine(lesson.exampleLine);
    assert.ok(moves.length > 0, `${lesson.title} 範例棋路不得為空`);
    for (const san of moves) {
      assert.doesNotThrow(() => game.move(san), `${lesson.title} 含非法走法 ${san}`);
    }
  }
});
