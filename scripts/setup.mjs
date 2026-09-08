#!/usr/bin/env node
// First-run setup for ZIP (or clone) installs: Node version gate, then
// build -> init wizard (writes config.yaml) -> doctor (connectivity check).
// Run once after `npm install`. Safe to re-run: it stops at the first
// failing step with the command to retry.
import { spawnSync } from "node:child_process";

const major = Number(process.versions.node.split(".")[0] || 0);
if (!Number.isFinite(major) || major < 20) {
  console.error(`\nExchange Agentic Admin needs Node.js 20 or later (found ${process.version}).`);
  console.error("Download it from https://nodejs.org/en/download, then re-run: npm run setup\n");
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
function step(label, args) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(npmCmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\nSetup stopped at "${label}" (exit ${r.status ?? "signal"}).`);
    console.error("Fix the error above, then re-run: npm run setup\n");
    process.exit(r.status ?? 1);
  }
}

step("Build", ["run", "build"]);
step("Init wizard — creates config.yaml", ["run", "init"]);
step("Doctor — tests Exchange connectivity", ["run", "doctor"]);

console.log("\nSetup complete.");
console.log("  Next:   npm run desktop   (builds + starts the desktop app)");
console.log("  Verify: npm test          (runs the test suite)\n");
