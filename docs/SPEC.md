# Mailclock: Product and Technical Spec

> Open-source, MCP-native email scheduling. Schedule emails from your app, the dashboard, or an AI agent, and see exactly what was scheduled, sent, retried, and failed.

Status: **v1 built** (Phase 1 and most of Phase 2 below). License: **MIT**.

This document describes what exists and what is planned. Anything planned is marked **(planned)**; everything else is in the code. For setup and usage, see the [README](../README.md).

---

## 1. Why Mailclock exists

| Existing option | Gap |
|---|---|
| useSend, Plunk | AGPL, built around Amazon SES |
| Listmonk, Mautic, Keila | Newsletter and marketing tools, not developer infrastructure |
| Novu | A heavyweight notification platform |
| Trigger.dev, Hatchet, bull-board | Generic job runners with engineer-only UIs |
| Resend's MCP server | Can schedule, but Resend-only, a 30-day horizon, and not self-hostable |

**Mailclock's position:** a provider-agnostic, Postgres-only, MIT-licensed email scheduler with a first-class MCP server, guardrails for AI agents, and a dashboard a product owner can read.

## 2. Two ways to use it

1. **Self-host:** clone the repository, run it with Docker Compose (or `npm run dev`), and bring your own SMTP or Resend credentials. The only dependency is PostgreSQL.
2. **Hosted:** sign up on a deployment (Vercel plus Neon Postgres), create a project, add a provider, then connect over the REST API or MCP.

## 3. Repositories

| Repo | Contents |
|---|---|
| `mailclock` (this repo) | The platform: `apps/web` (Next.js dashboard, REST API, remote MCP), `apps/worker` (dispatcher), `packages/core` (domain logic, providers), `packages/db` (Prisma) |
| `mailclock-cli` **(planned, empty)** | npm packages: the `mailclock` CLI, `@mailclock/sdk`, and `@mailclock/mcp` (a local stdio MCP server). They will talk to the platform only through the public API. |
| `mailclock-docs` **(planned, empty)** | A documentation site |

## 4. Architecture

```
  Your app ────────┐
  Dashboard ───────┼──► apps/web ──► Postgres ◄── dispatcher ──► SMTP / Resend
  MCP client ──────┘   (REST, MCP,   (email rows    (worker loop or cron route;
                        dashboard)    are the queue)  FOR UPDATE SKIP LOCKED)
```

- **Postgres is the queue.** The `email` row is the single source of truth; there is no second queue to keep in sync.
- **One owner for state changes.** `packages/core/src/lifecycle.ts` is the only code that changes an email's status or writes its events. Each move is one transaction: a guarded `UPDATE` (expected status, and for the dispatcher, still holding the lease) plus the event rows, written only if the row moved. A CI check rejects writes elsewhere.
- **One dispatch function, two runners.** `dispatchDue()` in `packages/core` is called by:
  - `apps/worker`, a long-running loop (every ~2 seconds);
  - `GET /api/cron/dispatch`, protected by `CRON_SECRET`. On Vercel Hobby the built-in cron runs it daily; an external scheduler or Vercel Pro runs it every minute.
- **Crash safety.** A row stuck in `SENDING` past its lease (120 s by default) is reclaimed and retried. Delivery is at-least-once; Resend de-duplicates by email ID.
- **No horizon limit.** An email can be scheduled any time in the future.

## 5. Domain model

- **User:** dashboard login through Better Auth (email and password with confirmation; GitHub and Google optional).
- **Project:** the tenant boundary. Owns API keys, providers, and emails.
- **ApiKey:** `mc_live_…`; only a SHA-256 hash is stored. Scopes `emails:read` and `emails:write`. Optional daily limit on emails scheduled (positive integer or none, enforced by a database constraint).
- **Provider:** `MOCK | SMTP | RESEND`. Credentials encrypted at rest (AES-256-GCM with `MAILCLOCK_ENCRYPTION_KEY`), an optional hourly limit, one default per project. SMTP requires TLS (STARTTLS or implicit) and a public host unless private hosts are allowed. **(Planned:** SES and Postmark, a priority order, and failover.)
- **Email:** from, to/cc/bcc (up to 50 each), subject, html/text, tags, metadata, `idempotencyKey`, `sendAt`, `status`, `attempts`, `maxAttempts` (1–10, default 5), `nextAttemptAt`, `providerMessageId`, `lastError`, `source` (`DASHBOARD | API | MCP | CLI`), `actor` (`user:<id>` or `key:<id>`).
- **EmailEvent:** an append-only timeline with typed payloads: `CREATED`, `RESCHEDULED`, `CANCELLED`, `SENT`, `ATTEMPT_FAILED`, `FAILED` (records whether the provider rejected it outright), `RETRY_REQUESTED`, `RATE_LIMITED`. (`ATTEMPT_STARTED` exists in the schema but nothing writes it.)
- **RateLimit / ApiRateLimit:** counters for sign-in and API-key rate limits, stored in Postgres so limits hold across instances.

### Email lifecycle

```
SCHEDULED ──► SENDING ──► SENT
   │  ▲          │
   │  └─ RETRYING ◄┘  temporary error: backoff 30 s · 2^(n-1), capped at 1 h, ±20% jitter
   │                  └──► FAILED  (attempts used up, or a permanent error)
   │                         └──► manual retry → SCHEDULED
   └──► CANCELLED      (cancel and reschedule are allowed while SCHEDULED or RETRYING)
```

Status groups and the actions each status allows live in `packages/core/src/status.ts`.

## 6. Public REST API

`/api/v1`, authenticated with `Authorization: Bearer mc_live_…`. Each key may make 120 requests a minute (REST and MCP combined); over that, `429 rate_limited` with `Retry-After`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/emails` | Schedule one email (`sendAt` optional = now). Honours the `Idempotency-Key` header or `idempotencyKey` field. |
| `POST` | `/emails/batch` | Schedule up to 1,000 emails in one transaction, optionally `staggerSeconds` apart |
| `GET` | `/emails` | List; filter by `status`, `tag`, `source`, `q`; `limit` 1–100; cursor pagination |
| `GET` | `/emails/:id` | Email plus its event timeline |
| `PATCH` | `/emails/:id` | Reschedule (`sendAt`) while `SCHEDULED` or `RETRYING` |
| `POST` | `/emails/:id/cancel` | Cancel while `SCHEDULED` or `RETRYING` |
| `POST` | `/emails/:id/retry` | Re-queue a `FAILED` email |
| `GET` | `/stats` | Counts per status, sent and failed in the last 24 h, scheduled for the next 24 h |

Errors: `{ "error": { "code": "…", "message": "…", "details": … } }`. Codes: `validation_error` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `invalid_state` and `conflict` 409, `no_provider` 422, `quota_exceeded` and `rate_limited` 429, `internal_error` 500.

## 7. MCP server

Remote, over Streamable HTTP at `/api/mcp`, authenticated with an API key. Stateless: each request authenticates and gets a fresh server, so it runs on serverless hosts. **(Planned:** a local stdio package, `@mailclock/mcp`.)

| Tool | Scope | Annotations |
|---|---|---|
| `schedule_email` | `emails:write` | idempotent |
| `schedule_batch` | `emails:write` | |
| `reschedule_email` | `emails:write` | idempotent |
| `cancel_email` | `emails:write` | destructive, idempotent |
| `retry_email` | `emails:write` | |
| `list_emails` | `emails:read` | read-only |
| `get_email` | `emails:read` | read-only |
| `get_stats` | `emails:read` | read-only |

**Agent guardrails (built):** a key only sees the tools its scopes allow; a per-key daily limit on emails scheduled; per-key request rate limits; every action attributed to the key on the email's timeline. **(Planned:** an approval queue, where agent-created emails wait for a human to approve them in the dashboard.)

## 8. Dashboard

- **Overview:** a 24-hour timeline (the last 6 hours sent and failed, the next 18 scheduled, counted in the database), the last 24 h figures, what's coming up, what needs attention, and a setup checklist.
- **Emails:** a table filterable by status with search; each email opens a page with its message, full timeline, provider response, and actions (cancel, reschedule, retry).
- **Failed:** an inbox of `FAILED` emails with a bulk "send all again".
- **Compose:** schedule one email or a list (CSV import, up to 1,000 recipients), optionally spaced out.
- **Providers**, **API keys**, and **Connect your app** (curl, Node, and MCP configuration snippets).
- A public **landing page**, plus sign-in, sign-up, and password reset pages.

**(Planned:** project settings, member management, per-provider rate-limit headroom on the overview.)

## 9. Roadmap

| Phase | Scope | State |
|---|---|---|
| **1 — Foundation** | Monorepo, schema, auth, projects, API keys, encrypted providers (Mock, SMTP, Resend), Postgres dispatcher with worker and cron route, REST v1, dashboard, Docker Compose, README | Done |
| **2 — Agents** | Remote MCP server, daily limits, rate limits, email confirmation | Done |
| | Approval queue; `mailclock-cli`: CLI, SDK, local MCP server | Planned |
| **3 — Product** | Signed webhooks, templates (React Email with variables), suppression list, send windows and quiet hours, SES and Postmark with failover, audit log, data retention and account deletion | Planned |
| **4 — Ecosystem** | `mailclock-docs`, OpenAPI spec, one-click deploy (Railway, Vercel, Coolify), open and click tracking | Planned |

## 10. Non-goals (for now)

Newsletter list management, a visual journey builder, inbound email.
