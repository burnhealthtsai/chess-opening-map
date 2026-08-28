import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const detail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/OpeningDetail.css", import.meta.url), "utf8");

test("leaf openings explain why no named child variation is shown", () => {
  assert.match(detail, /opening\.variations\.length === 0/);
  assert.match(detail, /沒有同名、可靠歸屬的具名子變例/);
  assert.match(detail, /重要招法｜接下來怎麼下/);
  assert.match(styles, /\.empty-variations/);
});
