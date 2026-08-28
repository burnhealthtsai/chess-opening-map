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
  assert.match(component, /group\.relation === relationFilter/);
  assert.match(component, /visibleGroups\.length/);
  assert.match(component, /setRelationFilter\("all"\)/);
  assert.match(styles, /\.analogy-relation-filters/);
  assert.match(styles, /\.analogy-relation-filters button\[aria-pressed="true"\]/);
});

test("relation counts follow the active search and explain filtered empty results", () => {
  assert.match(component, /const queryMatchedGroups = useMemo/);
  assert.match(component, /queryMatchedGroups\.filter\(\(group\) => group\.relation === option\.id\)/);
  assert.match(component, /aria-label=\{`\$\{option\.label\}：\$\{count\} 個\$\{query\.trim\(\) \? "符合搜尋的" : ""\}群組`\}/);
  assert.match(component, />\{count\}<\/small>/);
  assert.match(component, /queryMatchedGroups\.length === 0/);
  assert.match(component, /在「\{analogyRelationLabels\[relationFilter\]\}」分類沒有符合群組/);
});

test("Escape clears the search before the relation filter without moving focus", () => {
  assert.match(component, /function clearSearchWithEscape\(event: KeyboardEvent<HTMLInputElement>\)/);
  assert.match(component, /if \(event\.key !== "Escape"\) return/);
  assert.match(component, /if \(query\) \{[\s\S]*setQuery\(""\);[\s\S]*return;/);
  assert.match(component, /if \(relationFilter !== "all"\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*setRelationFilter\("all"\)/);
  assert.match(component, /onKeyDown=\{clearSearchWithEscape\}/);
  assert.match(component, /aria-keyshortcuts="Escape"/);
  assert.match(component, /Esc：先清搜尋，再清分類/);
});

test("analogy relation labels keep a text label and a relation-specific visual class", () => {
  assert.match(component, /className=\{`relation-\$\{item\.relation\}`\}/);
  assert.match(component, />\{analogyRelationLabels\[item\.relation\]\}<\/span>/);
  for (const relation of ["reversed", "structure", "plan"]) {
    assert.match(styles, new RegExp(`\\.analogy-group-list \\.relation-${relation}`));
    assert.match(styles, new RegExp(`\\.analogy-badge\\.${relation}`));
  }
});
