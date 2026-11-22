#!/usr/bin/env node
// arch-check.mjs — runs dependency-cruiser with the rules in .dependency-cruiser.cjs and maps its
// exit code onto the convention every check here uses: 0 pass, 1 violations, 2 could not run.
// (depcruise exits with the number of violations, which would read as "could not run".)
//
// dependency-cruiser does not support TypeScript 7.0, so it runs in isolation with TypeScript 6
// via npx; the project itself stays on TypeScript 7.
//
// Usage: node scripts/arch-check.mjs            check, ignoring known violations (the ratchet)
//        node scripts/arch-check.mjs --baseline  rewrite .dependency-cruiser-known-violations.json
import { spawnSync } from "node:child_process";

const PKGS = ["-p", "dependency-cruiser@18.8.0", "-p", "typescript@6.0.3"];
const baseline = process.argv.includes("--baseline");
const args = baseline
  ? ["depcruise-baseline", "apps", "packages", "--config", ".dependency-cruiser.cjs", "--output-to", ".dependency-cruiser-known-violations.json"]
  : ["depcruise", "apps", "packages", "--config", ".dependency-cruiser.cjs", "--ignore-known", "--output-type", "err"];

const r = spawnSync("npx", ["--yes", ...PKGS, ...args], { encoding: "utf8", shell: process.platform === "win32" });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
process.stdout.write(out);

if (baseline) process.exit(r.status === 0 ? 0 : 2);
if (r.status === 0 && /no dependency violations found/.test(out)) {
  // A run that cruised nothing is not a pass (e.g. the TypeScript parser failed to load).
  const cruised = /\((\d+) modules, (\d+) dependencies cruised\)/.exec(out);
  if (!cruised || Number(cruised[2]) === 0) {
    console.error("arch-check: no dependencies were cruised; the check did not really run");
    process.exit(2);
  }
  process.exit(0);
}
process.exit(/dependency violations? \(/.test(out) ? 1 : 2);
