export const analogyHashPrefix = "#analogy/";

export function readAnalogyHash(hash: string) {
  if (!hash.startsWith(analogyHashPrefix)) return null;
  try {
    const groupId = decodeURIComponent(hash.slice(analogyHashPrefix.length));
    return groupId || null;
  } catch {
    return null;
  }
}

export function writeAnalogyHash(groupId: string, mode: "push" | "replace" = "replace") {
  const nextHash = `${analogyHashPrefix}${encodeURIComponent(groupId)}`;
  if (window.location.hash === nextHash) return;
  const url = new URL(window.location.href);
  url.hash = nextHash;
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
}

export function clearAnalogyHash() {
  if (!readAnalogyHash(window.location.hash)) return;
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url);
}
