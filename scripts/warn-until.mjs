#!/usr/bin/env node
// warn-until.mjs — runs a check and, until a date, reports a violation as a warning instead of a
// failure. On and after the date the check blocks, with no one having to remember to flip it.
//
// Usage: node scripts/warn-until.mjs <YYYY-MM-DD> -- <command> [args...]
// The wrapped command's exit code decides: 0 pass; 1 violation (warns before the date, fails on or
// after it); anything else means the check could not run, which always fails.
import { spawnSync } from "node:child_process";

const [until, sep, cmd, ...args] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(until ?? "") || sep !== "--" || !cmd) {
  console.error("warn-until: usage: node scripts/warn-until.mjs <YYYY-MM-DD> -- <command> [args...]");
  process.exit(2);
}

const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
const code = r.status ?? 2;
const today = new Date().toISOString().slice(0, 10);

if (code === 0) process.exit(0);
if (code === 1 && today < until) {
  const msg = `${cmd} ${args.join(" ")} found violations. This warns until ${until} and blocks after (CONSTRAINTS.md).`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warn-until: ${msg}`);
  process.exit(0);
}
process.exit(code === 1 ? 1 : 2);
