import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("large search result sets render preview boards in bounded batches", () => {
  assert.match(app, /const searchPageSize = 24/);
  assert.match(app, /searchResults\.slice\(0, searchVisibleCount\)/);
  assert.match(app, /visibleNodes\.map\(\(node\) => <OpeningCard[^>]+preview/);
  assert.match(app, /Math\.min\(current \+ searchPageSize, searchResults\.length\)/);
  assert.match(app, /className="search-load-more" aria-controls="search-result-grid"/);
  assert.match(app, /已顯示 \{visibleNodes\.length\} \/ \{nodes\.length\} 個開局/);
  assert.match(styles, /\.search-load-more \{[^}]*min-height: 44px/);
});

test("WASD navigation stays inside the currently rendered search batch", () => {
  assert.match(app, /if \(query\.trim\(\)\) \{\s*candidates = visibleSearchResults;/);
});
