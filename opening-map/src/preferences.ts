const preferencePrefix = "opening-map:";

function preferenceStorage() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function readStoredChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = preferenceStorage()?.getItem(`${preferencePrefix}${key}`);
    return value && choices.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

export function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = preferenceStorage()?.getItem(`${preferencePrefix}${key}`);
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredPreference(key: string, value: string | boolean) {
  try { preferenceStorage()?.setItem(`${preferencePrefix}${key}`, String(value)); } catch { /* Storage can be disabled by the browser. */ }
}
