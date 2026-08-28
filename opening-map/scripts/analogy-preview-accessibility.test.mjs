import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/AnalogyExplorer.tsx", import.meta.url), "utf8");

test("analogy preview names add the word position exactly once", () => {
  assert.match(component, /const positionDescription = label\.endsWith\("局面"\) \? label : `\$\{label\}局面`/);
  assert.match(component, /aria-label=\{`\$\{opening\.title_zh\}：\$\{positionDescription\}`\}/);
  assert.doesNotMatch(component, /aria-label=\{`\$\{opening\.title_zh\}\$\{label\}局面`\}/);
  for (const expected of ["主線走完後局面", "起始局面", "第 3 手後局面", "反色配置形成局面"]) {
    const rawLabel = expected.endsWith("後局面") ? expected.slice(0, -2) : expected;
    const positionDescription = rawLabel.endsWith("局面") ? rawLabel : `${rawLabel}局面`;
    assert.equal(positionDescription, expected);
    assert.doesNotMatch(positionDescription, /局面局面/);
  }
});
