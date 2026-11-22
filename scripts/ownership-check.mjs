#!/usr/bin/env node
// ownership-check.mjs — keeps each piece of email state with its one owner.
//
// Diff-scoped: fails only when a change ADDS a line that bypasses an owner, so existing code is
// not a wall of red, and every new line has to use the supported way. Each error names the
// function to use instead. Rules and their reasons are listed in CLAUDE.md.
//
// Exception (rare): put on the offending line, or the line above it,
//   // ownership-allow <rule>: <reason> (expires YYYY-MM-DD, approved-by @handle)
// An allow without a reason, a future expiry, and an approver is itself a violation.
//
// Usage: node scripts/ownership-check.mjs [--base <ref>]   (default origin/main)
// Exit: 0 clean, 1 violation, 2 could not run.
import { readFileSync } from "node:fs";
import { DiffError, addedLines, repoRoot } from "./lib/diff.mjs";

// A crash must never read as a violation (1) or a pass (0): it means the check did not run.
process.on("uncaughtException", (e) => {
  console.error(e instanceof DiffError ? `ownership-check: ${e.message}` : e);
  process.exit(2);
});

const S = "(?:SCHEDULED|SENDING|RETRYING|SENT|FAILED|CANCELLED)";
const LIFECYCLE = "packages/core/src/lifecycle.ts";

export const RULES = [
  {
    name: "event-writes",
    pattern: /\.emailEvent\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b|\bevents:\s*\{\s*create\b/,
    allowed: [LIFECYCLE],
    fix: `Email events are written only by ${LIFECYCLE}: use moveEmail() (status change and event in one transaction) or createdEvent()/createdEventRows() for new emails.`,
  },
  {
    name: "status-writes",
    pattern: /\.email\.(update|updateMany|upsert)\b|\bUPDATE\s+"?email"?\b/i,
    allowed: [LIFECYCLE],
    fix: `Change an email only through moveEmail() or claimDue() in ${LIFECYCLE}; they guard the move and record its event.`,
  },
  {
    name: "status-groups",
    pattern: new RegExp(
      [
        `status\\s*[!=]==?\\s*["']${S}["']\\s*(\\|\\||&&)\\s*[\\w.?]*status\\s*[!=]==?`, // a === "X" || a === "Y"
        `status:\\s*\\{\\s*(in|notIn):\\s*\\[\\s*["']${S}`, // Prisma { in: ["X", ...] }
        `\\[\\s*["']${S}["']\\s*,\\s*["']${S}["'][^\\]]*\\]\\s*\\.includes\\(`, // ["X","Y"].includes(
      ].join("|"),
    ),
    allowed: ["packages/core/src/status.ts", LIFECYCLE],
    fix: "Use the status groups in packages/core/src/status.ts (PENDING_STATUSES, IN_FLIGHT_STATUSES, isPending, isInFlight, allowedActions) instead of listing statuses.",
  },
  {
    name: "api-key-auth",
    pattern: /\bverifyApiKey\s*\(/,
    allowed: ["apps/web/src/lib/api.ts", "packages/core/src/api-keys.ts"],
    fix: "Authenticate API-key requests with authenticateApiKey(req, scope) from apps/web/src/lib/api.ts (or wrap the route in apiRoute()).",
  },
];

const isChecked = (f) => /^(apps|packages)\/.*\.(m?[jt]sx?)$/.test(f) && !/(\.test\.|\/test\/|\/generated\/)/.test(f);
const ALLOW = /ownership-allow\s+([\w-]+):\s*(.+?)\s*\(expires\s+(\d{4}-\d{2}-\d{2}),\s*approved-by\s+@[\w-]+\)/;

function allowFor(file, line, rule) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const text of [lines[line - 1], lines[line - 2]]) {
    if (!text?.includes("ownership-allow")) continue;
    const m = ALLOW.exec(text);
    if (!m) return { ok: false, why: "malformed ownership-allow (needs: <rule>: <reason> (expires YYYY-MM-DD, approved-by @handle))" };
    if (m[1] !== rule) continue;
    if (m[3] < new Date().toISOString().slice(0, 10)) return { ok: false, why: `ownership-allow for ${rule} expired on ${m[3]}` };
    return { ok: true, why: m[2] };
  }
  return null;
}

const baseIdx = process.argv.indexOf("--base");
const base = baseIdx > -1 ? process.argv[baseIdx + 1] : "origin/main";
repoRoot();

const findings = [];
for (const { file, line, text } of addedLines(base)) {
  if (!isChecked(file)) continue;
  for (const rule of RULES) {
    if (rule.allowed.includes(file) || !rule.pattern.test(text)) continue;
    const allow = allowFor(file, line, rule.name);
    if (allow?.ok) {
      console.log(`ownership-check: allowed [${rule.name}] ${file}:${line} — ${allow.why}`);
      continue;
    }
    findings.push({ rule, file, line, text: text.trim().slice(0, 110), note: allow?.why });
  }
}

if (findings.length === 0) {
  console.log("ownership-check: clean");
  process.exit(0);
}
console.error(`ownership-check: ${findings.length} line(s) bypass an owner:`);
for (const f of findings) {
  console.error(`\n  [${f.rule.name}] ${f.file}:${f.line}\n    ${f.text}\n    → ${f.rule.fix}${f.note ? `\n    (${f.note})` : ""}`);
}
process.exit(1);
