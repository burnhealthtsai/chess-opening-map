import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const boundary = await readFile(new URL("../src/AppErrorBoundary.tsx", import.meta.url), "utf8").catch(() => "");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("runtime and lazy chunk failures render a recoverable application state", () => {
  assert.match(main, /<AppErrorBoundary><App \/><\/AppErrorBoundary>/);
  assert.match(boundary, /class AppErrorBoundary extends Component/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /className="app-runtime-error" role="alert"/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(boundary, /重新載入應用程式/);
  assert.match(styles, /\.app-runtime-error/);
});
