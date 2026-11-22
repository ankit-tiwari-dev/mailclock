#!/usr/bin/env node
// coverage-gate.mjs — two coverage constraints from CONSTRAINTS.md, read from an lcov report the
// test run already wrote (no second test run):
//   1. Changed lines: of the executable lines this change added under the covered paths, at least
//      MIN_CHANGED% must be hit.
//   2. Ratchet: total line coverage must not fall more than TOLERANCE below the value recorded in
//      CONSTRAINTS.md ("Measured, not yet enforced" table, row "Core line coverage").
//
// Usage: node scripts/coverage-gate.mjs <lcov.info> [--base <ref>]   (default base: origin/main)
// Exit: 0 pass, 1 constraint failed, 2 could not run (never read a 2 as a pass).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const MIN_CHANGED = 80; // CONSTRAINTS.md: changed lines ≥ 80% covered
const TOLERANCE = 0.5; // CONSTRAINTS.md: ratchet tolerance, percentage points

const bail = (msg) => {
  console.error(`coverage-gate: ${msg}`);
  process.exit(2);
};
const args = process.argv.slice(2);
const lcovPath = args[0];
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
if (!lcovPath || !existsSync(lcovPath)) bail(`lcov report not found: ${lcovPath ?? "(none given)"}`);

const git = (a) => {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });
  } catch {
    return null;
  }
};
const top = git(["rev-parse", "--show-toplevel"])?.trim();
if (!top) bail("not inside a git work tree");
const toRepoPath = (p) => relative(top, resolve(p)).split("\\").join("/");

// ─── Parse lcov: file → Map<line, hits> ──────────────────────────────────────
const files = new Map();
let current = null;
for (const line of readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
  if (line.startsWith("SF:")) {
    current = new Map();
    // lcov paths are relative to the directory the test runner ran in.
    files.set(toRepoPath(resolve(lcovPath, "..", "..", line.slice(3))), current);
  } else if (line.startsWith("DA:") && current) {
    const [ln, hits] = line.slice(3).split(",").map(Number);
    current.set(ln, hits);
  } else if (line === "end_of_record") current = null;
}
if (files.size === 0) bail("lcov report has no files");

// ─── Ratchet against the recorded value ─────────────────────────────────────
let total = 0;
let hit = 0;
for (const lines of files.values()) for (const h of lines.values()) (total++, h > 0 && hit++);
const projectPct = (hit / total) * 100;

const constraints = existsSync(`${top}/CONSTRAINTS.md`) ? readFileSync(`${top}/CONSTRAINTS.md`, "utf8") : "";
const row = constraints.split(/\r?\n/).find((l) => /^\|\s*Core line coverage\s*\|/.test(l));
const recorded = row ? Number(row.split("|")[2]?.replaceAll("%", "").trim()) : NaN;
if (!Number.isFinite(recorded)) bail('no "Core line coverage" row with a number in CONSTRAINTS.md');

// ─── Changed lines ───────────────────────────────────────────────────────────
const mergeBase = git(["merge-base", base, "HEAD"])?.trim();
if (!mergeBase) bail(`no merge base against ${base}`);
const diff = git(["-C", top, "diff", "--unified=0", mergeBase, "--", ...new Set([...files.keys()].map((f) => f.split("/").slice(0, 3).join("/")))]);
if (diff === null) bail("could not diff");

const changed = new Map(); // file → Set<line>
let file = null;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ ")) file = line.slice(4) === "/dev/null" ? null : line.slice(6);
  else if (line.startsWith("@@") && file) {
    const m = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    const set = changed.get(file) ?? new Set();
    for (let i = start; i < start + count; i++) set.add(i);
    changed.set(file, set);
  }
}
// Untracked files count as wholly changed.
for (const f of (git(["-C", top, "ls-files", "--others", "--exclude-standard"]) ?? "").split("\n").filter(Boolean)) {
  if (files.has(f)) changed.set(f, new Set(files.get(f).keys()));
}

let changedTotal = 0;
let changedHit = 0;
const misses = [];
for (const [f, lines] of changed) {
  const cov = files.get(f);
  if (!cov) continue; // not an instrumented file (tests, config, docs)
  for (const ln of lines) {
    if (!cov.has(ln)) continue; // not executable
    changedTotal++;
    if (cov.get(ln) > 0) changedHit++;
    else misses.push(`${f}:${ln}`);
  }
}
const changedPct = changedTotal ? (changedHit / changedTotal) * 100 : 100;

// ─── Verdict ─────────────────────────────────────────────────────────────────
const fmt = (n) => n.toFixed(2);
console.log(`coverage-gate: changed lines ${changedHit}/${changedTotal} = ${fmt(changedPct)}% (need ≥ ${MIN_CHANGED}%)`);
console.log(`coverage-gate: core lines ${hit}/${total} = ${fmt(projectPct)}% (recorded ${recorded}%, may not fall below ${fmt(recorded - TOLERANCE)}%)`);

const failures = [];
if (changedPct < MIN_CHANGED) failures.push(`changed-line coverage ${fmt(changedPct)}% < ${MIN_CHANGED}%`);
if (projectPct < recorded - TOLERANCE) failures.push(`core coverage fell to ${fmt(projectPct)}% from recorded ${recorded}%`);
if (projectPct > recorded + 1) console.log(`coverage-gate: coverage rose; raise the recorded value in CONSTRAINTS.md to ${fmt(projectPct)}%`);

if (failures.length) {
  for (const f of failures) console.error(`coverage-gate: FAIL ${f}`);
  if (misses.length) console.error(`  uncovered changed lines (first 20): ${misses.slice(0, 20).join(", ")}`);
  process.exit(1);
}
console.log("coverage-gate: pass");
