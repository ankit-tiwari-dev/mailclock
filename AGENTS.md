Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.

Before handing work back, run `npm run check:task` (needs the test database; see README → Development) and fix what it reports.

## Rules and what enforces them

Each rule exists because the mistake happened here at least twice. Prefer the enforcement column to this prose: if a rule here has nothing enforcing it and the mistake happens again, fix it with code (an owner, a type, or a check), not more text. Drop a rule once its mistake can no longer happen.

| Rule | Why (past mistake) | Enforced by |
|---|---|---|
| Change an email's status, or write its events, only through `moveEmail()`, `claimDue()`, `insertEmails()`, or `createdEvent()` in `packages/core/src/lifecycle.ts` | The dispatcher wrote SENT/FAILED events after its lease was reclaimed (3 sites), separately from the row update | `npm run check:ownership` (event-writes, status-writes); test "a runner whose lease was reclaimed…" |
| Event payloads have one type, `EventData` in `lifecycle.ts`; read stored events with `readEvents()` | Writers and three readers disagreed (UI labelled any one-attempt failure "rejected by the provider") | TypeScript: `moveEmail()` only accepts `EmailEventInput`; readers get `EmailEventView` |
| Ask "is it pending / can it be cancelled?" with `packages/core/src/status.ts` (`PENDING_STATUSES`, `isPending`, `isInFlight`, `allowedActions`), never a hand-written list of statuses | 41 status literals in 13 files; the email page's "live" disagreed with core's "pending" | `npm run check:ownership` (status-groups) |
| Authenticate API-key requests with `authenticateApiKey()` / `apiRoute()` in `apps/web/src/lib/api.ts` | Bearer parsing was copied into the MCP route, which then skipped the read-scope check | `npm run check:ownership` (api-key-auth) |
| Pages and components get data through `packages/core`, not `prisma` | Dashboard pages re-derived queries and project scoping | `npm run check:arch` (`web-ui-not-to-db`, no exceptions) |
| A check exits 0 pass, 1 violation, 2 could not run; a crash is 2 | dependency-cruiser "passed" after checking 0 modules; crashes exited 1 and read as violations | `npm run test:checks` |
| No suppressions, stubs, skipped tests, removed assertions, or weakened `CONSTRAINTS.md` | — (the floor) | `npm run check:floor` |
| No secret-shaped strings, even in tests | A test used `sk_live_…` as a "wrong prefix" key and tripped the secret scanner | `npm run check:security -- secrets` (CI) |

If a rule genuinely cannot apply to one line, add a row to the Exceptions table in CONSTRAINTS.md and reference it on that line (`// ownership-allow W3`). Do not invent an approval in a code comment; the check only accepts table rows, and the floor guard makes every new row visible in review.

### Judgment calls (nothing enforces these)

- When you start a long-running dev process in the background, start it so that stopping it stops the server (e.g. `exec node …`), and check the port is free afterwards. Wrapper processes (`npx`, `npm run`) left orphaned servers holding ports and locking `node_modules` three times.
- A failing check is information. Fix the code; if the check itself is wrong, fix the check and add a case to `scripts/checks.test.mjs`.
