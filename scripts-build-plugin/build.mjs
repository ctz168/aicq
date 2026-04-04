/**
 * Build script for AICQ OpenClaw plugin.
 *
 * 1. TypeScript compile (tsc)
 * 2. esbuild bundle (inlines @aicq/crypto, tweetnacl, uuid, dotenv, qrcode)
 * 3. Clean up old tsc output — only dist/index.js (the bundle) remains
 *
 * External deps (NOT bundled, expected at runtime):
 *   - openclaw  (provided by OpenClaw gateway)
 *   - ws        (provided by OpenClaw gateway / npm install --production)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..", "plugin");
const DIST = path.join(ROOT, "dist");

// Resolve binaries from local node_modules
const tscBin = path.join(ROOT, "node_modules", ".bin", "tsc");

// Step 1: TypeScript compile
console.log("[1/3] Compiling TypeScript...");
execSync(`"${tscBin}"`, { cwd: ROOT, stdio: "pipe" });

// Step 2: esbuild bundle (use API directly from node_modules)
console.log("[2/3] Bundling with esbuild...");
const { buildSync } = await import(path.join(ROOT, "node_modules", "esbuild", "lib", "main.js"));
buildSync({
  entryPoints: [path.join(DIST, "index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(DIST, "index.bundle.js"),
  external: ["openclaw", "ws"],
  allowOverwrite: true,
});
console.log(`       Bundle size: ${(fs.statSync(path.join(DIST, "index.bundle.js")).size / 1024).toFixed(1)} KB`);

// Step 3: Clean old tsc output, keep only the bundle
console.log("[3/3] Cleaning old tsc output...");
for (const entry of fs.readdirSync(DIST)) {
  if (entry === "index.bundle.js") continue;
  const full = path.join(DIST, entry);
  fs.rmSync(full, { recursive: true, force: true });
}
fs.renameSync(path.join(DIST, "index.bundle.js"), path.join(DIST, "index.js"));

const remaining = fs.readdirSync(DIST);
console.log(`       dist/ contents: ${remaining.join(", ")}`);
console.log("Build complete!");
