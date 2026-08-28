import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Chess } from "chess.js";

const lessonsUrl = new URL("../src/tacticLessons.json", import.meta.url);
const componentUrl = new URL("../src/ConceptExplorer.tsx", import.meta.url);

function movesFromLine(line) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

test("每個戰術與技巧都有可重播的合法範例", async () => {
  const lessons = JSON.parse(await readFile(lessonsUrl, "utf8"));
  assert.ok(Array.isArray(lessons));
  assert.ok(lessons.filter(({ group }) => group === "戰術").length >= 5);
  assert.ok(lessons.filter(({ group }) => group === "技巧").length >= 4);
  assert.deepEqual(new Set(lessons.map(({ group }) => group)), new Set(["戰術", "技巧"]), "只允許戰術與技巧兩組");
  assert.equal(new Set(lessons.map(({ title }) => title)).size, lessons.length, "標題不得重複");

  for (const lesson of lessons) {
    for (const field of ["icon", "title", "cue", "exampleFen", "example", "exampleLine"]) {
      assert.equal(typeof lesson[field], "string", `${lesson.title || "未命名課程"} 的 ${field} 必須是字串`);
      assert.ok(lesson[field].trim(), `${lesson.title || "未命名課程"} 的 ${field} 不得為空`);
    }
    assert.match(lesson.example, /例如/, `${lesson.title} 需有具體範例`);
    assert.ok(Array.isArray(lesson.steps), `${lesson.title} 的步驟必須是陣列`);
    assert.equal(lesson.steps.length, 3, `${lesson.title} 需有三個辨識步驟`);
    assert.ok(lesson.steps.every((step) => typeof step === "string" && step.trim()), `${lesson.title} 的步驟不得為空`);

    const game = new Chess(lesson.exampleFen);
    const moves = movesFromLine(lesson.exampleLine);
    assert.ok(moves.length > 0, `${lesson.title} 範例棋路不得為空`);
    for (const san of moves) {
      assert.doesNotThrow(() => game.move(san), `${lesson.title} 含非法走法 ${san}`);
    }
  }
});

test("戰術與技巧只保留一個資料來源", async () => {
  const component = await readFile(componentUrl, "utf8");
  assert.match(component, /import tacticLessonData from "\.\/tacticLessons\.json"/);
  assert.doesNotMatch(component, /const tacticLessons = \[/, "不得在元件內再複製一份課程資料");
});
