import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [component, styles] = await Promise.all([
  readFile(new URL("../src/AnalogyExplorer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AnalogyExplorer.css", import.meta.url), "utf8"),
]);

test("analogy groups can be searched by opening metadata and shared ideas", () => {
  assert.match(component, /aria-label="搜尋類似比較群組"/);
  assert.match(component, /placeholder="搜尋開局、ECO 或比較觀念"/);
  assert.match(component, /opening\.title_zh/);
  assert.match(component, /opening\.title_en/);
  assert.match(component, /opening\.eco/);
  assert.match(component, /group\.sharedIdeas/);
  assert.match(component, /visibleGroups\.map/);
  assert.match(component, /visibleGroups\[target\]/);
});

test("analogy search reports results and keeps an accessible empty state", () => {
  assert.match(component, /aria-live="polite" className="analogy-search-status"/);
  assert.match(component, /找不到符合「\{query\.trim\(\)\}」的類似比較群組/);
  assert.match(component, /清除搜尋/);
  assert.match(styles, /\.analogy-search/);
  assert.match(styles, /\.analogy-search-empty/);
});

test("analogy groups can be filtered by relation while keeping search active", () => {
  assert.match(component, /const analogyRelationFilters/);
  assert.match(component, /useState<"all" \| AnalogyGroup\["relation"\]>/);
  assert.match(component, /aria-label="依類似關係篩選"/);
  assert.match(component, /aria-pressed=\{relationFilter === option\.id\}/);
  assert.match(component, /group\.relation !== relationFilter/);
  assert.match(component, /visibleGroups\.length/);
  assert.match(component, /setRelationFilter\("all"\)/);
  assert.match(styles, /\.analogy-relation-filters/);
  assert.match(styles, /\.analogy-relation-filters button\[aria-pressed="true"\]/);
});

test("analogy relation labels keep a text label and a relation-specific visual class", () => {
  assert.match(component, /className=\{`relation-\$\{item\.relation\}`\}/);
  assert.match(component, />\{analogyRelationLabels\[item\.relation\]\}<\/span>/);
  for (const relation of ["reversed", "structure", "plan"]) {
    assert.match(styles, new RegExp(`\\.analogy-group-list \\.relation-${relation}`));
    assert.match(styles, new RegExp(`\\.analogy-badge\\.${relation}`));
  }
});
