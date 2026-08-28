import type { OpeningMapData } from "./types";

export const openingMapSnapshotKey = "opening-map:catalog-snapshot";

function storage() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isOpeningMapData(value: unknown, schemaVersion: number): value is OpeningMapData {
  if (!isRecord(value)
    || value.schema_version !== schemaVersion
    || typeof value.catalog_revision !== "string"
    || !/^[a-f0-9]{64}$/.test(value.catalog_revision)
    || !Array.isArray(value.nodes)
    || value.nodes.length === 0
    || !isRecord(value.navigation)) return false;

  const navigation = value.navigation;
  if (!Array.isArray(navigation.sides)
    || !Array.isArray(navigation.first_moves)
    || !Array.isArray(navigation.families)
    || !Array.isArray(navigation.styles)) return false;

  return value.nodes.every((node) => isRecord(node)
    && typeof node.id === "string"
    && typeof node.title_zh === "string"
    && typeof node.title_en === "string"
    && (node.side === "白方" || node.side === "黑方")
    && (node.category === "主流" || node.category === "趣味")
    && typeof node.eco === "string"
    && typeof node.first_move === "string"
    && typeof node.first_move_san === "string"
    && typeof node.reply_san === "string"
    && typeof node.mainline === "string"
    && Array.isArray(node.styles)
    && node.styles.every((style) => typeof style === "string")
    && Array.isArray(node.variations)
    && node.variations.every((variation) => isRecord(variation)
      && typeof variation.name === "string"
      && typeof variation.line === "string")
    && isRecord(node.subgroup)
    && typeof node.subgroup.id === "string"
    && typeof node.subgroup.label === "string"
    && isRecord(node.family)
    && typeof node.family.id === "string"
    && typeof node.family.label === "string");
}

export function readOpeningMapSnapshot(schemaVersion: number) {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(openingMapSnapshotKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isOpeningMapData(parsed, schemaVersion)) return parsed;
    target.removeItem(openingMapSnapshotKey);
  } catch {
    try { target.removeItem(openingMapSnapshotKey); } catch { /* Storage can be read-only. */ }
  }
  return null;
}

export function writeOpeningMapSnapshot(data: OpeningMapData, schemaVersion: number) {
  if (!isOpeningMapData(data, schemaVersion)) return false;
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(openingMapSnapshotKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
