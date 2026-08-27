import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [index, robots, sitemap, styles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
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

test("publishes crawlable canonical metadata for the Cloudflare primary site", () => {
  assert.match(index, new RegExp(`<link rel="canonical" href="${canonicalUrl}"`));
  assert.match(index, new RegExp(`<meta property="og:url" content="${canonicalUrl}"`));
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(index, /"@type": "WebApplication"/);
  assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
  assert.match(robots, new RegExp(`Sitemap: ${canonicalUrl}sitemap\\.xml`));
  assert.match(sitemap, new RegExp(`<loc>${canonicalUrl}</loc>`));
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
