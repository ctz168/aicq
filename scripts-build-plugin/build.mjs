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
const MONO_ROOT = path.resolve(import.meta.dirname, "..");

// Resolve binaries — try local first, then monorepo root (hoisted deps)
function resolveBin(name) {
  const local = path.join(ROOT, "node_modules", ".bin", name);
  if (fs.existsSync(local)) return local;
  const hoisted = path.join(MONO_ROOT, "node_modules", ".bin", name);
  if (fs.existsSync(hoisted)) return hoisted;
  return name; // fallback to PATH
}
function resolveModule(pkg, subpath) {
  // Try local, then monorepo root
  for (const base of [ROOT, MONO_ROOT]) {
    const candidate = path.join(base, "node_modules", ...pkg.split("/"), ...(subpath || []));
    if (fs.existsSync(candidate)) return candidate;
  }
  // Last resort: use require.resolve from ROOT
  try { return require.resolve(path.join(pkg, ...(subpath || []).join("/"))); } catch { /* ignore */ }
  return path.join(ROOT, "node_modules", ...pkg.split("/"), ...(subpath || []));
}

const tscBin = resolveBin("tsc");

// Step 1: TypeScript compile
console.log("[1/3] Compiling TypeScript...");
execSync(`"${tscBin}"`, { cwd: ROOT, stdio: "pipe" });

// Step 2: esbuild bundle (use API directly from node_modules)
console.log("[2/3] Bundling with esbuild...");
const esbuildEntry = resolveModule("esbuild", ["lib", "main.js"]);
const { buildSync } = await import(esbuildEntry);
buildSync({
  entryPoints: [path.join(DIST, "index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(DIST, "index.bundle.js"),
  external: ["openclaw", "ws"],
  allowOverwrite: true,
  banner: {
    js: `import { createRequire } from "module"; const require = createRequire(import.meta.url);`,
  },
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
