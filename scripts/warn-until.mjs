#!/usr/bin/env node
// warn-until.mjs — runs a check and, until the date CONSTRAINTS.md gives for its warning period,
// reports a violation as a warning instead of a failure. On and after that date the check blocks.
//
// The date lives only in CONSTRAINTS.md ("warn until YYYY-MM-DD"), where the floor guard flags any
// change to it; a date passed on the command line could be pushed back without anyone noticing.
//
// Usage: node scripts/warn-until.mjs -- <command> [args...]   (command: node or an executable on PATH)
// The wrapped command's exit code decides: 0 pass; 1 violation (warns before the date, fails on or
// after it); anything else means the check could not run, which always fails.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// A crash must never read as a violation (1) or a pass (0): it means the check did not run.
process.on("uncaughtException", (e) => { console.error(e); process.exit(2); });
process.on("unhandledRejection", (e) => { console.error(e); process.exit(2); });

const [sep, cmd, ...args] = process.argv.slice(2);
if (sep !== "--" || !cmd) {
  console.error("warn-until: usage: node scripts/warn-until.mjs -- <command> [args...]");
  process.exit(2);
}

let constraints;
try {
  constraints = readFileSync("CONSTRAINTS.md", "utf8");
} catch {
  console.error("warn-until: CONSTRAINTS.md not found (run from the repository root)");
  process.exit(2);
}
const dates = [...new Set([...constraints.matchAll(/warn until (\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]))];
if (dates.length !== 1) {
  console.error(`warn-until: CONSTRAINTS.md must give exactly one "warn until YYYY-MM-DD" date; found ${dates.length ? dates.join(", ") : "none"}`);
  process.exit(2);
}
const until = dates[0];

// No shell, so arguments are never re-parsed. "node" runs as this exact Node binary.
const r = spawnSync(cmd === "node" ? process.execPath : cmd, args, { stdio: "inherit" });
if (r.error) {
  console.error(`warn-until: could not start ${cmd}: ${r.error.message}`);
  process.exit(2);
}
const code = r.status ?? 2;
const today = new Date().toISOString().slice(0, 10);

if (code === 0) process.exit(0);
if (code === 1 && today < until) {
  const msg = `${cmd} ${args.join(" ")} found violations. This warns until ${until} and blocks after (CONSTRAINTS.md).`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warn-until: ${msg}`);
  process.exit(0);
}
process.exit(code === 1 ? 1 : 2);
