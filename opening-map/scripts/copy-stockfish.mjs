import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules", "stockfish");
const packageMetadata = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(packageMetadata.version)) throw new Error("Invalid Stockfish package version");
const destinationRoot = resolve(root, "public", "stockfish");
const destination = resolve(destinationRoot, packageMetadata.version);
const files = [
  ["bin/stockfish-18-lite-single.js", "stockfish-18-lite-single.js"],
  ["bin/stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"],
  ["Copying.txt", "Copying.txt"],
];

await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const [from, to] of files) await copyFile(resolve(source, from), resolve(destination, to));
console.log(`Copied Stockfish ${packageMetadata.version} Lite browser engine to ${destination}`);
