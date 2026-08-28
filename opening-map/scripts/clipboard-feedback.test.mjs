import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/OpeningDetail.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/OpeningDetail.css", import.meta.url), "utf8");

test("clipboard denial becomes a visible PGN copy error instead of an unhandled rejection", () => {
  assert.match(app, /if \(!navigator\.clipboard\?\.writeText\) return false/);
  assert.match(app, /await navigator\.clipboard\.writeText\(line\);\s*return true;\s*\} catch \{\s*return false/);
  assert.match(detail, /const copied = await onCopy\(line\)\.catch\(\(\) => false\)/);
  assert.match(detail, /無法存取剪貼簿，請手動選取下方棋譜/);
  assert.match(detail, /className=\{`copy-feedback \$\{copyState\}`\} role="status"/);
  assert.match(styles, /\.copy-feedback\.error/);
});

test("successful PGN copy has pending and completed button states", () => {
  assert.match(detail, /"idle" \| "copying" \| "success" \| "error"/);
  assert.match(detail, /copyState === "copying" \? "複製中…" : copyState === "success" \? "已複製 ✓" : "複製 PGN"/);
  assert.match(detail, /disabled=\{copyState === "copying"\}/);
  assert.match(detail, /PGN 已複製到剪貼簿/);
  assert.match(detail, /copyRequestRef\.current \+= 1;\s*setCopyState\("idle"\)/);
  assert.match(detail, /if \(copyRequestRef\.current === request\) setCopyState/);
});
