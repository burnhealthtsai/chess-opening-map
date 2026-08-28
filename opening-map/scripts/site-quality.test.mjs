import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [index, robots, sitemap, headers, styles, analogyStyles, puzzleStyles, styleStyles, transpositionStyles, conceptStyles, opponentStyles, openingDetailStyles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
  readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/AnalogyExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/PuzzleExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/StyleExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/TranspositionExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ConceptExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/OpponentExplorer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/OpeningDetail.css", import.meta.url), "utf8"),
]);

const canonicalUrl = "https://chess-opening-map.pages.dev/";

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function mixHex(base, tint, baseWeight) {
  const baseChannels = base.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16));
  const tintChannels = tint.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16));
  return `#${baseChannels.map((value, index) => Math.round(value * baseWeight + tintChannels[index] * (1 - baseWeight)).toString(16).padStart(2, "0")).join("")}`;
}

test("publishes crawlable canonical metadata for the Cloudflare primary site", () => {
  assert.match(index, new RegExp(`<link rel="canonical" href="${canonicalUrl}"`));
  assert.match(index, new RegExp(`<meta property="og:url" content="${canonicalUrl}"`));
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(index, /"@type": "WebApplication"/);
  assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
  assert.match(robots, new RegExp(`Sitemap: ${canonicalUrl}sitemap\\.xml`));
  assert.match(sitemap, new RegExp(`<loc>${canonicalUrl}</loc>`));
});

test("preloads the opening catalog before the application bundle runs", () => {
  assert.match(index, /<link rel="preload" href="\.\/opening-map\.json" as="fetch" crossorigin="anonymous" \/>/);
});

test("fingerprinted and versioned assets use immutable browser caching without freezing live catalogs", () => {
  assert.match(headers, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/stockfish\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /opening-(?:map|details)|notion-puzzle|index\.html/);
});

test("classification labels meet WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#247a36", "#eaf7ec"],
    ["#176aa6", "#e9f3fd"],
    ["#9b5700", "#fff4e5"],
    ["#7d218f", "#f8ebfa"],
    ["#9e3157", "#fcecf2"],
    ["#56677e", "#edf4fb"],
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.match(styles, new RegExp(foreground));
  }
  assert.match(styles, /\.taxonomy-zone \.subgroup-symbol\.mover-black i \{ color: #fff; \}/);
});

test("analogy comparison labels meet WCAG AA in light and dark themes", () => {
  const pairs = [
    ["#1f7198", "#ffffff"],
    ["#8a4d05", "#ffffff"],
    ["#874b05", "#ffffff"],
    ["#7fd2ff", "#17243a"],
    ["#c8d7e9", "#22334c"],
    ["#e6f2ff", "#4b5a6c"],
    ["#d2e2f4", "#17243a"],
    ["#7fcff2", "#17243a"],
    ["#ffc36a", "#17243a"],
    ["#ffca78", "#17243a"],
    ["#c4d2e4", "#22334c"],
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.ok(styles.includes(foreground) || analogyStyles.includes(foreground), `${foreground} must be present in explorer styles`);
  }
  assert.match(styles, /\[data-theme="dark"\] \.map-summary b/);
  assert.match(analogyStyles, /\[data-theme="dark"\] \.analogy-ideas span/);
});

test("analogy relation filters meet WCAG AA in every theme and state", () => {
  const lightSurface = "#ffffff";
  const darkSurface = "#17243a";
  const lightBadge = mixHex(lightSurface, "#ccecf9", 0.62);
  const darkBadge = "#3a586a";
  const lightPressed = mixHex(lightSurface, "#ffe5b8", 0.76);
  const darkPressed = mixHex(darkSurface, "#ffe5b8", 0.76);
  const pairs = [
    ["#45647c", lightSurface, "light button"],
    ["#275f7c", lightBadge, "light count badge"],
    ["#754309", lightPressed, "light pressed button"],
    ["#ffffff", "#a65d08", "light pressed count badge"],
    ["#d2e2f4", darkSurface, "dark button"],
    ["#bfeaff", darkBadge, "dark count badge"],
    ["#ffe2b5", darkPressed, "dark pressed button"],
    ["#ffffff", "#a65d08", "dark pressed count badge"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label}: ${foreground} on ${background} must reach 4.5:1`);
  }
  assert.match(analogyStyles, /\.analogy-relation-filters button\[aria-pressed="true"\]/);
  assert.match(analogyStyles, /\[data-theme="dark"\] \.analogy-relation-filters button small \{ color: #bfeaff; background: #3a586a; \}/);
  assert.match(analogyStyles, /\[data-theme="dark"\] \.analogy-relation-filters button\[aria-pressed="true"\] small \{ color: #fff; background: #a65d08; \}/);
});

test("dark puzzle, style and transposition labels meet WCAG AA contrast", () => {
  const pairs = [
    ["#d8b9ef", "#17243a", puzzleStyles],
    ["#d6b8ec", "#17243a", puzzleStyles],
    ["#82cff1", "#17243a", styleStyles],
    ["#1c668c", "#e5f4fb", transpositionStyles],
    ["#c4d2e4", "#17243a", transpositionStyles],
    ["#ffffff", "#176486", transpositionStyles],
    ["#b8d6ea", "#17243a", transpositionStyles],
    ["#7fd3f5", "#17243a", transpositionStyles],
  ];
  for (const [foreground, background, source] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.ok(source.includes(foreground) || (foreground === "#ffffff" && source.includes("#fff")), `${foreground} must be present in its lazy explorer styles`);
  }
  assert.match(puzzleStyles, /\[data-theme="dark"\] \.puzzle-stats b/);
  assert.match(styleStyles, /\[data-theme="dark"\] \.style-card small/);
  assert.match(transpositionStyles, /\[data-theme="dark"\] \.transposition-routes p/);
});

test("concept and opponent information badges meet WCAG AA contrast", () => {
  const pairs = [
    ["#ffffff", "#176486", conceptStyles],
    ["#ffffff", "#a95f00", conceptStyles],
    ["#ffffff", "#21734a", conceptStyles],
    ["#ffffff", "#256b43", conceptStyles],
    ["#ffffff", "#966000", conceptStyles],
    ["#ffffff", "#664293", conceptStyles],
    ["#ffffff", "#176486", opponentStyles],
    ["#ffffff", "#a95f00", opponentStyles],
    ["#ffffff", "#21734a", opponentStyles],
    ["#ffffff", "#966000", opponentStyles],
    ["#ffffff", "#1f7198", opponentStyles],
    ["#82cff1", "#17243a", opponentStyles],
    ["#93dfb5", "#17243a", opponentStyles],
    ["#ffca78", "#17243a", opponentStyles],
  ];
  for (const [foreground, background, source] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.ok(source.includes(foreground) || (foreground === "#ffffff" && source.includes("#fff")), `${foreground} must be present in its lazy explorer styles`);
  }
  assert.match(opponentStyles, /\[data-theme="dark"\] \.opponent-levels small/);
  assert.match(opponentStyles, /\[data-theme="dark"\] \.recognized-opening\.off-book small/);
});

test("secondary labels remain readable across mixed light and dark surfaces", () => {
  const pairs = [
    ["#596b84", "#ffffff", styles],
    ["#596b84", "#edf4fb", styles],
    ["#1f7198", "#edf4fb", styles],
    ["#ffffff", "#176486", styles],
    ["#ffffff", "#1f7198", styles],
    ["#82cff1", "#17243a", styles],
    ["#e8effa", "#193225", styles],
    ["#e8effa", "#183048", styles],
    ["#e8effa", "#3a2d1a", styles],
    ["#e8effa", "#33223d", styles],
    ["#e8effa", "#3b2230", styles],
    ["#aabbd1", "#193225", styles],
    ["#aabbd1", "#183048", styles],
    ["#aabbd1", "#3a2d1a", styles],
    ["#aabbd1", "#33223d", styles],
    ["#aabbd1", "#3b2230", styles],
    ["#9fe2b2", "#193225", styles],
    ["#9ed8ff", "#183048", styles],
    ["#ffd08a", "#3a2d1a", styles],
    ["#e3b7ef", "#33223d", styles],
    ["#f2b2cb", "#3b2230", styles],
    ["#56677e", "#ffffff", opponentStyles],
    ["#596b84", "#edf4fb", opponentStyles],
    ["#c4d2e4", "#22334c", opponentStyles],
    ["#563786", "#f5f0ff", puzzleStyles],
    ["#1c668c", "#e5f4fb", transpositionStyles],
    ["#1f7198", "#ffffff", transpositionStyles],
    ["#ffffff", "#176486", transpositionStyles],
  ];
  for (const [foreground, background, source] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.ok(source.includes(foreground) || (foreground === "#ffffff" && source.includes("#fff")), `${foreground} must be present in its stylesheet`);
  }
  assert.match(styles, /\[data-theme="dark"\] \.engine-heading-actions button/);
  assert.match(styles, /\[data-theme="dark"\] \.breadcrumb button,/);
  assert.match(styles, /\.side-switcher button\.active\.white-side \{[^}]*linear-gradient\(135deg, #176486, #1f7198\)/);
  assert.match(styles, /\.board-controls button\.manual-toggle\.on \{ background: #a95f00; \}/);
  assert.match(styles, /\[data-theme="dark"\] \.taxonomy-zone:nth-child\(5\)/);
  assert.match(opponentStyles, /\.player-seats \.white small \{ color: #56677e; \}/);
  assert.match(puzzleStyles, /\.puzzle-last-move small \{[^}]*color: #563786;/);
});

test("expanded map, opening detail, puzzle answer and blind panels meet WCAG AA", () => {
  const pairs = [
    ["#ffffff", "#176486", styles],
    ["#ffffff", "#a95f00", styles],
    ["#1f7198", "#edf4fb", styles],
    ["#82cff1", "#22334c", styles],
    ["#ffffff", "#21734a", puzzleStyles],
    ["#d9c1f2", "#17243a", opponentStyles],
    ["#ffffff", "#176486", openingDetailStyles],
    ["#ffffff", "#a95f00", openingDetailStyles],
    ["#ffffff", "#21734a", openingDetailStyles],
    ["#c4d2e4", "#22334c", openingDetailStyles],
    ["#82cff1", "#17243a", openingDetailStyles],
    ["#93dfb5", "#17243a", openingDetailStyles],
    ["#ffd08a", "#17243a", openingDetailStyles],
    ["#b5cdf5", "#17243a", openingDetailStyles],
    ["#d6b8ec", "#17243a", openingDetailStyles],
    ["#ffca78", "#17243a", openingDetailStyles],
    ["#8ed8ff", "#17243a", openingDetailStyles],
  ];
  for (const [foreground, background, source] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must reach 4.5:1`);
    assert.ok(source.includes(foreground) || (foreground === "#ffffff" && source.includes("#fff")), `${foreground} must be present in its dynamic-panel stylesheet`);
  }
  assert.match(styles, /\.taxonomy-zone \.family-frame-move > span\.mover-black i,/);
  assert.match(styles, /\[data-theme="dark"\] \.section-heading button/);
  assert.match(puzzleStyles, /\.puzzle-preview-actions button\.answer-active \{[^}]*background: #21734a;/);
  assert.match(opponentStyles, /\[data-theme="dark"\] \.blind-guide-locked \{ color: #d9c1f2; \}/);
  assert.match(openingDetailStyles, /\[data-theme="dark"\] \.phase-endgame h4 \{ color: #93dfb5; \}/);
});
