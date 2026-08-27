import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8").catch(() => "");

test("opening details and knowledge load only after an opening is selected", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/OpeningDetail"\)\)/);
  assert.match(app, /<Suspense fallback=/);
  assert.doesNotMatch(app, /from "\.\/openingKnowledge"/);
  assert.match(detail, /export default function OpeningDetail/);
  assert.match(detail, /from "\.\/openingKnowledge"/);
});
