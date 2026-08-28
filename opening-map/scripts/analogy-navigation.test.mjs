import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const navigation = await readFile(new URL("../src/analogyNavigation.ts", import.meta.url), "utf8");

test("analogy URL helpers encode, decode and reject unrelated hashes", () => {
  assert.match(navigation, /export const analogyHashPrefix = "#analogy\/"/);
  assert.match(navigation, /encodeURIComponent\(groupId\)/);
  assert.match(navigation, /decodeURIComponent/);
  assert.match(navigation, /hash\.startsWith\(analogyHashPrefix\)/);
  assert.match(navigation, /history\[mode === "push" \? "pushState" : "replaceState"\]/);
  assert.match(navigation, /export function clearAnalogyHash/);
});
