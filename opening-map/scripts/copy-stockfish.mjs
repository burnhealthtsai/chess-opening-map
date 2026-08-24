import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules", "stockfish");
const destination = resolve(root, "public", "stockfish");
const files = [
  ["bin/stockfish-18-lite-single.js", "stockfish-18-lite-single.js"],
  ["bin/stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"],
  ["Copying.txt", "Copying.txt"],
];

await mkdir(destination, { recursive: true });
for (const [from, to] of files) await copyFile(resolve(source, from), resolve(destination, to));
console.log(`Copied Stockfish 18 Lite browser engine to ${destination}`);
