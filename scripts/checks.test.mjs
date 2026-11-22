// Self-tests for the repo's own checks. Each case replays a real past mistake (or the clean
// version of it) in a throwaway git repo and asserts the exit code: 0 pass, 1 violation,
// 2 could not run. A check that "passes" without doing its work is the failure these guard.
//
// Run: node --test scripts/checks.test.mjs   (no database, Docker, or network needed)
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
// Fixture text for the floor guard's own tests. Assembled at runtime so the floor guard, which also
// reads this file, does not mistake the fixtures for real suppressions or skips. Keeping this file
// under the guard (rather than in .constraintsignore) keeps its own assertions protected.
const TS_IGNORE = "// @ts-" + "ignore";
const IT_SKIP = "it." + "skip";

/** A CONSTRAINTS.md with the parts the checks read: a threshold, a warning date, a ratchet, exceptions. */
const constraintsMd = ({ threshold = 80, warnUntil = "2099-01-01", pages = 12 } = {}) =>
  [
    "| Dimension | Rule | Mode |",
    "|---|---|---|",
    `| Coverage | Changed lines ≥ ${threshold}% covered | warn until ${warnUntil}, then block |`,
    `| Accessibility | Zero serious violations on all ${pages} pages and 3 states the scan visits | CI |`,
    "",
    "| Metric | Today |",
    "|---|---|",
    "| Core line coverage | 50.00% | must not fall |",
    "",
    "| ID | Rule | Path | Reason | Owner | Expires |",
    "|---|---|---|---|---|---|",
    "| W1 | api-key-auth | apps/web/src/x.ts | Migration shim | @owner | 2099-01-01 |",
    "| W2 | api-key-auth | apps/web/src/old.ts | Old shim | @owner | 2000-01-01 |",
    "",
  ].join("\n");
let repo;

const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const run = (script, ...args) => spawnSync(process.execPath, [join(repo, "scripts", script), ...args], { cwd: repo, encoding: "utf8" }).status;

/** Write files, run the check against the committed base, then restore the clean tree. */
function withChange(files, fn) {
  for (const [path, text] of Object.entries(files)) write(path, text);
  try {
    return fn();
  } finally {
    git("checkout", "-q", "--", ".");
    git("clean", "-fdq", "--", "apps", "packages");
  }
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), "mailclock-checks-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "checks@test");
  git("config", "user.name", "checks");
  git("config", "core.autocrlf", "false");
  cpSync(SCRIPTS, join(repo, "scripts"), { recursive: true });
  write(".constraintsignore", "scripts/floor-guard.mjs\n");
  write("packages/core/src/lifecycle.ts", "export const x = 1;\n");
  write("packages/core/test/a.test.ts", 'it("works", () => {\n  expect(1).toBe(1);\n});\n');
  write("CONSTRAINTS.md", constraintsMd());
  git("add", "-A");
  git("commit", "-qm", "base");
});

after(() => rmSync(repo, { recursive: true, force: true }));

describe("ownership-check (replays mistakes made in this repo)", () => {
  const check = () => run("ownership-check.mjs", "--base", "HEAD");

  it("passes a clean tree", () => assert.equal(check(), 0));

  it("rejects an event written outside the lifecycle module (dispatcher, Nov 2026)", () =>
    withChange({ "packages/core/src/dispatcher.ts": "await prisma.emailEvent.create({ data });\n" }, () => assert.equal(check(), 1)));

  it("rejects a status update outside the lifecycle module", () =>
    withChange({ "packages/core/src/dispatcher.ts": "const { count } = await prisma.email.updateMany({ where, data });\n" }, () =>
      assert.equal(check(), 1)));

  it("rejects a hand-written status group (email page `live`, Nov 2026)", () =>
    withChange(
      { "apps/web/src/page.tsx": 'const live = email.status === "SCHEDULED" || email.status === "SENDING" || email.status === "RETRYING";\n' },
      () => assert.equal(check(), 1),
    ));

  it("rejects a hand-written Prisma status list", () =>
    withChange({ "apps/web/src/page.tsx": 'prisma.email.findMany({ where: { status: { in: ["SCHEDULED", "RETRYING"] } } });\n' }, () =>
      assert.equal(check(), 1)));

  it("rejects a second copy of API-key parsing (MCP route, Nov 2026)", () =>
    withChange({ "apps/web/src/app/api/mcp/route.ts": "const key = await verifyApiKey(header?.slice(7));\n" }, () =>
      assert.equal(check(), 1)));

  it("allows the same code inside its owner", () =>
    withChange({ "packages/core/src/lifecycle.ts": "export const x = 1;\nawait tx.emailEvent.createMany({ data });\n" }, () =>
      assert.equal(check(), 0)));

  it("accepts an exception that references an unexpired CONSTRAINTS.md row for this rule and path", () =>
    withChange({ "apps/web/src/x.ts": "// ownership-allow W1\nverifyApiKey(t);\n" }, () => assert.equal(check(), 0)));

  it("rejects an expired exception row", () =>
    withChange({ "apps/web/src/old.ts": "// ownership-allow W2\nverifyApiKey(t);\n" }, () => assert.equal(check(), 1)));

  it("rejects an exception used outside the path its row covers", () =>
    withChange({ "apps/web/src/elsewhere.ts": "// ownership-allow W1\nverifyApiKey(t);\n" }, () => assert.equal(check(), 1)));

  it("rejects a self-approved exception with no CONSTRAINTS.md row (sharp edges, 2026-11-22)", () =>
    withChange({ "apps/web/src/x.ts": "// ownership-allow api-key-auth: trust me (expires 2099-01-01, approved-by @me)\nverifyApiKey(t);\n" }, () =>
      assert.equal(check(), 1)));

  it("rejects a reference to a row that does not exist", () =>
    withChange({ "apps/web/src/x.ts": "// ownership-allow W9\nverifyApiKey(t);\n" }, () => assert.equal(check(), 1)));

  it("reports 'could not run' for a bad base, never a pass", () => assert.equal(run("ownership-check.mjs", "--base", "nope"), 2));
});

describe("floor-guard", () => {
  const check = () => run("floor-guard.mjs", "--base", "HEAD");

  it("passes a clean tree", () => assert.equal(check(), 0));
  it("rejects a new TypeScript suppression comment", () => withChange({ "packages/core/src/y.ts": `${TS_IGNORE}\nexport const y: number = 'a';\n` }, () => assert.equal(check(), 1)));
  it("rejects a skipped test", () =>
    withChange({ "packages/core/test/a.test.ts": `${IT_SKIP}("works", () => {\n  expect(1).toBe(1);\n});\n` }, () => assert.equal(check(), 1)));
  it("rejects a removed assertion", () =>
    withChange({ "packages/core/test/a.test.ts": 'it("works", () => {\n});\n' }, () => assert.equal(check(), 1)));
  it("rejects a loosened threshold in CONSTRAINTS.md", () =>
    withChange({ "CONSTRAINTS.md": constraintsMd({ threshold: 70 }) }, () => assert.equal(check(), 1)));
  it("treats a scanned-page count as a minimum: more pages pass, fewer are flagged", () => {
    withChange({ "CONSTRAINTS.md": constraintsMd({ pages: 14 }) }, () => assert.equal(check(), 0));
    withChange({ "CONSTRAINTS.md": constraintsMd({ pages: 10 }) }, () => assert.equal(check(), 1));
  });
  it("rejects a pushed-back warning date in CONSTRAINTS.md (sharp edges, 2026-11-22)", () =>
    withChange({ "CONSTRAINTS.md": constraintsMd({ warnUntil: "2100-06-01" }) }, () => assert.equal(check(), 1)));
  it("reports 'could not run' for a bad base", () => assert.equal(run("floor-guard.mjs", "--base", "nope"), 2));
});

describe("coverage-gate", () => {
  const lcov = (hits) => `SF:src/lifecycle.ts\n${hits.map((h, i) => `DA:${i + 1},${h}`).join("\n")}\nend_of_record\n`;
  const check = () => run("coverage-gate.mjs", "packages/core/coverage/lcov.info", "--base", "HEAD");

  it("passes when changed lines are covered", () =>
    withChange({ "packages/core/src/lifecycle.ts": "export const x = 1;\nexport const y = 2;\n", "packages/core/coverage/lcov.info": lcov([1, 1]) }, () =>
      assert.equal(check(), 0)));
  it("fails when a change adds untested lines", () =>
    withChange(
      { "packages/core/src/lifecycle.ts": "export const x = 1;\nexport const y = 2;\nexport const z = 3;\n", "packages/core/coverage/lcov.info": lcov([1, 0, 0]) },
      () => assert.equal(check(), 1),
    ));
  it("reports 'could not run' when the report is missing", () => assert.equal(check(), 2));
  it("reports 'could not run' when it crashes (report path is a directory)", () =>
    withChange({ "packages/core/coverage/lcov.info/x": "" }, () => assert.equal(check(), 2)));
});

describe("warn-until (date read from CONSTRAINTS.md)", () => {
  const wrap = (warnUntil, code) =>
    withChange({ "CONSTRAINTS.md": constraintsMd({ warnUntil }) }, () => run("warn-until.mjs", "--", "node", "-e", `process.exit(${code})`));
  it("downgrades a violation before the date", () => assert.equal(wrap("2099-01-01", 1), 0));
  it("blocks a violation on or after the date", () => assert.equal(wrap("2000-01-01", 1), 1));
  it("never downgrades 'could not run'", () => assert.equal(wrap("2099-01-01", 2), 2));
  it("fails when the command cannot start", () => assert.equal(run("warn-until.mjs", "--", "no-such-binary-xyz"), 2));
  it("refuses to guess when CONSTRAINTS.md gives two different dates", () =>
    withChange({ "CONSTRAINTS.md": `${constraintsMd()}| X | y | warn until 2100-01-01, then block |\n` }, () =>
      assert.equal(run("warn-until.mjs", "--", "node", "-e", "process.exit(1)"), 2)));
});

describe("quality-gate (axe)", () => {
  const gate = (report) =>
    withChange({ "r.json": typeof report === "string" ? report : JSON.stringify(report) }, () => run("quality-gate.mjs", "axe", "r.json"));
  const page = (impact) => [{ url: "http://localhost:3000/", violations: impact ? [{ id: "color-contrast", impact, nodes: [{}] }] : [] }];
  it("passes zero violations", () => assert.equal(gate(page(null)), 0));
  it("fails a serious violation (the contrast failures of Nov 2026)", () => assert.equal(gate(page("serious")), 1));
  it("passes a moderate one (below the bar)", () => assert.equal(gate(page("moderate")), 0));
  it("refuses an error page posing as a scan", () => assert.equal(gate("<html>502</html>"), 2));
});
