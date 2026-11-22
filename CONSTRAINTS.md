# Constraints

What "good enough to merge" means for Mailclock, with numbers and the command that checks each one.
This file is the source of truth; the npm scripts and CI jobs mirror it. If they disagree, this file wins.

Last reviewed: 2026-11-22 by @ankit-tiwari-dev

## How to run

| When | Command | Budget |
|---|---|---|
| After an edit | `npm run check:fast` | seconds |
| When a task is done (agent hands work back) | `npm run check:task` | ≤ 90 s |
| CI (every PR and push to main) | `.github/workflows/ci.yml` | unlimited |
| Anytime, needs Docker | `npm run check:security` | minutes |
| Anytime, needs the app running | `PREVIEW_URL=http://localhost:3000 npm run check:a11y` | ~1 min |

`check:task` needs the test database (see README → Development).

## Floor (always enforced, always blocking)

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `istanbul ignore`, `nosemgrep`, `gitleaks:allow`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` in place of code
- No skipped or deleted tests, and no assertions removed from tests that stay
- No secrets in committed source
- This file does not get weakened to make a change pass; a loosened threshold or a new exception is flagged by the floor guard

Checked by `node scripts/floor-guard.mjs --base origin/main` (diff-scoped; exit 0 clean, 1 violation, 2 could not run).
Paths the guard skips are listed, with reasons, in `.constraintsignore`.

## Enforced with numbers

| Dimension | Rule | Why this number | Checked by | Runs at | Mode |
|---|---|---|---|---|---|
| Types | Zero type errors in every workspace | Types are the cheapest bug net in a TS codebase | `npm run typecheck` | every edit, CI | block |
| Tests | Every core test passes against real Postgres | The queue relies on row locking, which mocks cannot verify | `npm test` | task end, CI | block |
| Secrets | Zero findings in committed history | One leaked provider key compromises a customer's sending domain | `npm run check:security -- secrets` (gitleaks, `--redact`) | CI | block |
| Coverage | Changed lines under `packages/` ≥ 80% covered | High enough to force a test, low enough to allow a config line | `npm run check:coverage` (lcov ∩ `git diff`) | task end, CI | warn until 2026-12-06, then block |
| Security: dependencies | No vulnerability with CVSS ≥ 7.0 (high or critical) | Below high is mostly noise for a server app | `npm run check:security -- deps` (osv-scanner) | CI | warn until 2026-12-06, then block |
| Security: code | No Semgrep finding at ERROR, HIGH, or CRITICAL | Same threshold as dependencies | `npm run check:security -- code` (Semgrep `p/default`) | CI | warn until 2026-12-06, then block |
| Accessibility | Zero critical or serious axe violations on all 10 public and dashboard pages | Moderate and minor are often debatable; serious blocks real users | `npm run check:a11y` (axe-core, WCAG 2.1 A/AA) | CI | warn until 2026-12-06, then block |
| Architecture | Zero new dependency-rule violations (rules in `.dependency-cruiser.cjs`) | Keeps data access and lifecycle rules in `packages/core` | `npm run check:arch` (dependency-cruiser via `scripts/arch-check.mjs`, `--ignore-known`) | CI | warn until 2026-12-06, then block |

External opinions (not judged by this project's own tests): gitleaks, osv-scanner, Semgrep, axe-core.

### Architecture rules

`no-circular` · `packages-not-to-apps` · `apps-independent` (web and worker never import each other) · `db-only-depends-on-prisma` · `web-ui-not-to-db` (pages and components reach data through `packages/core`; type-only imports allowed) · `client-not-to-server-only`.

## Measured, not yet enforced (ratchets)

Recorded on 2026-11-22. Each may improve; a drop beyond the tolerance is a finding.

| Metric | Today | Direction | Tolerance | Checked by |
|---|---|---|---|---|
| Core line coverage | 87.89% | must not fall | 0.5 points | `npm run check:coverage` |
| Core branch coverage | 70.71% | must not fall | 0.5 points | coverage text summary (manual) |
| Known architecture violations | 5 | must not grow | 0 | `.dependency-cruiser-known-violations.json` (`--ignore-known`) |

When a number improves, update it here in the same PR. The five known architecture violations are the dashboard files that query Prisma directly (`app/dashboard/{page,layout,actions,failed/page,emails/[id]/page}`); fixing one means regenerating the baseline with `npm run check:arch:baseline`.

## Known gaps

- `apps/web` and `apps/worker` have no test harness, so coverage is measured for `packages/` only. Adding one (and extending the coverage rule to `apps/`) is on the roadmap.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|---|---|---|---|---|---|

None. A new row needs an owner, an expiry ≤ 90 days out, and a reason discussed in review; the floor guard flags every new row.
