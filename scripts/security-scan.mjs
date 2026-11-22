#!/usr/bin/env node
// security-scan.mjs — the three security constraints in CONSTRAINTS.md, each run in its pinned
// Docker image so nothing has to be installed on a laptop and CI runs the exact same binary.
//
//   secrets  gitleaks    committed history (never the working tree, so a local .env is not read);
//                        --redact so a matched value never reaches logs. Any finding fails.
//   deps     osv-scanner every lockfile; fails on a vulnerability with CVSS ≥ 7.0 (high/critical).
//   code     Semgrep     p/default ruleset; fails on ERROR/HIGH/CRITICAL (scripts/quality-gate.mjs).
//
// Usage: node scripts/security-scan.mjs <secrets|deps|code|all>
// Exit:  0 pass, 1 blocking findings, 2 a scanner could not run (never read a 2 as a pass).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const IMAGES = {
  gitleaks: "ghcr.io/gitleaks/gitleaks:v8.30.1",
  osv: "ghcr.io/google/osv-scanner:v2.7.1",
  semgrep: "semgrep/semgrep:1.185.0",
};
const CVSS_BLOCKING = 7.0;

const which = process.argv[2];
if (!["secrets", "deps", "code", "all"].includes(which)) {
  console.error("security-scan: usage: node scripts/security-scan.mjs <secrets|deps|code|all>");
  process.exit(2);
}

const root = process.cwd();
const reports = join(root, ".reports");
mkdirSync(reports, { recursive: true });

const docker = (image, args) =>
  spawnSync("docker", ["run", "--rm", "-v", `${root}:/repo`, "-w", "/repo", image, ...args], { encoding: "utf8" });

function secrets() {
  // gitleaks exits 1 on findings (we ask for that explicitly) and other non-zero codes on errors.
  const r = docker(IMAGES.gitleaks, ["git", "/repo", "--redact", "--no-banner", "--exit-code", "1", "--report-format", "json", "--report-path", "/repo/.reports/gitleaks.json"]);
  if (r.status === 0) return (console.log("secrets: 0 findings"), 0);
  if (r.status === 1) {
    const findings = JSON.parse(readFileSync(join(reports, "gitleaks.json"), "utf8"));
    console.error(`secrets: ${findings.length} finding(s) — values redacted`);
    for (const f of findings) console.error(`  [${f.RuleID}] ${f.File}:${f.StartLine} (commit ${String(f.Commit).slice(0, 8)})`);
    return 1;
  }
  console.error(`secrets: gitleaks could not run (exit ${r.status}): ${r.stderr.trim().split("\n").at(-1)}`);
  return 2;
}

function deps() {
  // osv-scanner exits 1 when any vulnerability exists; severity is judged here instead.
  const r = docker(IMAGES.osv, ["scan", "source", "-r", "/repo", "--format", "json", "--output-file", "/repo/.reports/osv.json"]);
  if (r.status !== 0 && r.status !== 1) {
    console.error(`deps: osv-scanner could not run (exit ${r.status}): ${r.stderr.trim().split("\n").at(-1)}`);
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(join(reports, "osv.json"), "utf8"));
  } catch {
    console.error("deps: osv-scanner report unreadable");
    return 2;
  }
  if (!Array.isArray(report.results)) return (console.error("deps: osv-scanner report has no results array"), 2);
  const groups = report.results.flatMap((res) =>
    (res.packages ?? []).flatMap((p) =>
      (p.groups ?? []).map((g) => ({ pkg: `${p.package.name}@${p.package.version}`, ids: g.ids, score: Number(g.max_severity) })),
    ),
  );
  const blocking = groups.filter((g) => !Number.isFinite(g.score) || g.score >= CVSS_BLOCKING);
  console.log(`deps: ${groups.length} vulnerability group(s), ${blocking.length} at CVSS ≥ ${CVSS_BLOCKING} or unscored`);
  for (const g of blocking) console.error(`  ${g.pkg}: ${g.ids.join(", ")} (CVSS ${Number.isFinite(g.score) ? g.score : "unscored"})`);
  return blocking.length ? 1 : 0;
}

function code() {
  const r = docker(IMAGES.semgrep, ["semgrep", "scan", "--config", "p/default", "--strict", "--metrics", "off", "--json", "--output", "/repo/.reports/semgrep.json", "/repo"]);
  if (r.status !== 0 && r.status !== 1) {
    console.error(`code: semgrep could not run (exit ${r.status}): ${r.stderr.trim().split("\n").at(-1)}`);
    return 2;
  }
  const gate = spawnSync(process.execPath, [join(root, "scripts", "quality-gate.mjs"), "semgrep", join(reports, "semgrep.json")], { stdio: "inherit" });
  return gate.status ?? 2;
}

const run = { secrets, deps, code };
const selected = which === "all" ? Object.keys(run) : [which];
const codes = selected.map((k) => run[k]());
process.exit(codes.includes(2) ? 2 : codes.includes(1) ? 1 : 0);
