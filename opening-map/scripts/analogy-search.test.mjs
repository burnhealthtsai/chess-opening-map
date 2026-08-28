import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [component, styles] = await Promise.all([
  readFile(new URL("../src/AnalogyExplorer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AnalogyExplorer.css", import.meta.url), "utf8"),
]);

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

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

test("analogy summary distinguishes unique opening coverage from repeated memberships", () => {
  assert.match(component, /const coveredOpeningCount = useMemo\(\(\) => new Set\(groups\.flatMap\(\(group\) => \[\.\.\.group\.blackIds, \.\.\.group\.whiteIds\]\)\)\.size, \[groups\]\)/);
  assert.match(component, /const comparisonCount = useMemo\(\(\) => groups\.reduce\(\(sum, item\) => sum \+ item\.blackIds\.length \+ item\.whiteIds\.length, 0\), \[groups\]\)/);
  assert.match(component, /aria-label=\{`\$\{groups\.length\} 個比較群組，\$\{coveredOpeningCount\} 個不重複開局，\$\{comparisonCount\} 筆群組成員對照`\}/);
  assert.match(component, /<b>\{coveredOpeningCount\}<\/b><small>唯一開局<\/small>/);
  assert.match(component, /<b>\{comparisonCount\}<\/b><small>對照列次<\/small>/);
  assert.doesNotMatch(component, /groups\.reduce\(\(sum, item\) => sum \+ item\.blackIds\.length \+ item\.whiteIds\.length, 0\)<\/b>/);
  assert.match(styles, /\.analogy-explorer \.map-summary span/);
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

test("relation filters explain what each comparison category means", () => {
  assert.match(component, /const analogyRelationDescriptions/);
  assert.match(component, /reversed: ".*換成另一方使用/);
  assert.match(component, /structure: ".*兵形.*子力配置/);
  assert.match(component, /plan: ".*突破.*攻擊計畫/);
  assert.match(component, /aria-describedby="analogy-relation-description"/);
  assert.match(component, /id="analogy-relation-description" className="analogy-filter-explanation" aria-live="polite"/);
  assert.match(component, /\{analogyRelationFilters\.find\(\(option\) => option\.id === relationFilter\)\?\.label\}/);
  assert.match(component, /\{analogyRelationDescriptions\[relationFilter\]\}/);
  assert.match(styles, /\.analogy-filter-explanation/);
  assert.match(styles, /\.analogy-filter-explanation b/);
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
  assert.match(component, /aria-keyshortcuts="\/ Escape"/);
  assert.match(component, /Esc：先清搜尋，再清分類/);
});

test("slash focuses analogy search without hijacking form input", () => {
  assert.match(component, /const searchInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(component, /function focusSearchWithSlash\(event: KeyboardEvent<HTMLDivElement>\)/);
  assert.match(component, /event\.key !== "\/"/);
  assert.match(component, /event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey/);
  assert.match(component, /target\.matches\("input, textarea, select"\)/);
  assert.match(component, /target\.isContentEditable/);
  assert.match(component, /searchInputRef\.current\?\.focus\(\)/);
  assert.match(component, /onKeyDown=\{focusSearchWithSlash\}/);
  assert.match(component, /ref=\{searchInputRef\}/);
  assert.match(component, /aria-keyshortcuts="\/ Escape"/);
  assert.match(component, /／：跳到搜尋・Esc：先清搜尋，再清分類/);
});

test("clearing a query or empty result restores focus to search", () => {
  assert.match(component, /function focusSearchAfterUpdate\(\)/);
  assert.match(component, /requestAnimationFrame\(\(\) => searchInputRef\.current\?\.focus\(\{ preventScroll: true \}\)\)/);
  assert.match(component, /function clearQueryAndFocus\(\) \{[\s\S]*setQuery\(""\);[\s\S]*focusSearchAfterUpdate\(\)/);
  assert.match(component, /function clearFiltersAndFocus\(\) \{[\s\S]*setQuery\(""\);[\s\S]*setRelationFilter\("all"\);[\s\S]*focusSearchAfterUpdate\(\)/);
  assert.match(component, /onClick=\{clearQueryAndFocus\} aria-label="清除搜尋"/);
  assert.match(component, /onClick=\{clearFiltersAndFocus\}>清除篩選/);
});

test("analogy relation labels keep a text label and a relation-specific visual class", () => {
  assert.match(component, /className=\{`relation-\$\{item\.relation\}`\}/);
  assert.match(component, />\{analogyRelationLabels\[item\.relation\]\}<\/span>/);
  for (const relation of ["reversed", "structure", "plan"]) {
    assert.match(styles, new RegExp(`\\.analogy-group-list \\.relation-${relation}`));
    assert.match(styles, new RegExp(`\\.analogy-badge\\.${relation}`));
  }
});

test("analogy groups support shareable URL hashes and browser history navigation", () => {
  assert.match(component, /readAnalogyHash\(window\.location\.hash\)/);
  assert.match(component, /writeAnalogyHash\(id, historyMode\)/);
  assert.match(component, /window\.addEventListener\("popstate", syncGroupFromLocation\)/);
  assert.match(component, /window\.removeEventListener\("popstate", syncGroupFromLocation\)/);
  assert.match(component, /selectGroup\(item\.id, event\.detail > 0, "push"\)/);
  assert.match(component, /selectGroup\(visibleGroups\[target\]\.id, false, "replace"\)/);
  assert.match(app, /initialLensFromLocation/);
  assert.match(app, /readAnalogyHash\(window\.location\.hash\) \? "analogies" : "family"/);
  assert.match(app, /clearAnalogyHash\(\)/);
});
