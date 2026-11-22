# Mailclock — Product & Technical Spec

> Open-source, MCP-native email scheduling. Schedule emails from your app, your CLI, or your AI agent — and see exactly what was scheduled, sent, retried, and failed.

Status: **Draft v1** · Licence: **MIT**

---

## 1. Why Mailclock exists

| Existing option | Gap |
|---|---|
| useSend, Plunk | AGPL, SES-only |
| Listmonk, Mautic, Keila | Newsletter/marketing tools, not developer infra |
| Novu | Heavyweight notification platform |
| Trigger.dev, Hatchet, bull-board | Generic job runners, engineer-only UIs |
| Resend MCP | Only MCP that can schedule, but Resend-only, 30-day horizon, not self-hostable |

**Mailclock's position:** provider-agnostic, Postgres-only, MIT-licensed email scheduler with a first-class MCP server, agent guardrails, and a dashboard a product owner can read.

## 2. Two ways to use it

1. **Self-host** — `git clone`, `docker compose up`, bring your own SMTP / Resend / SES / Postmark credentials. Only dependency: PostgreSQL.
2. **Hosted** — sign up on the Vercel deployment, create a project, add a provider, then connect via REST API, SDK, CLI, or MCP (Claude, Cursor, any MCP client).

## 3. Repositories

| Repo | Contents |
|---|---|
| `mailclock` (this repo) | Platform: `apps/web` (Next.js dashboard + REST API + remote MCP), `apps/worker` (dispatcher), `packages/db` (Prisma), `packages/core` (domain logic, providers) |
| `mailclock-cli` | npm packages: `mailclock` CLI (`mailclock` / `mclk`), `@mailclock/sdk`, `@mailclock/mcp` (local stdio MCP) — talk to the platform only via the public API |
| `mailclock-docs` | Documentation site |

## 4. Architecture

```
  App / SDK / CLI ──┐
                    ├──► apps/web  ──► Postgres ◄── apps/worker ──► SMTP / Resend / SES / Postmark
  MCP client ───────┘   (REST, MCP,      (emails table      (claims due rows with
                         dashboard)       IS the queue)      FOR UPDATE SKIP LOCKED)
```

- **Postgres is the queue.** The `Email` row is the single source of truth; there is no second queue to keep in sync. Scheduling, cancelling, and rescheduling are plain transactional `UPDATE`s. The dispatcher claims due rows with `SELECT … FOR UPDATE SKIP LOCKED`, so any number of workers can run safely.
- **One dispatch function, two runners.** `dispatchDue()` in `packages/core` is called by:
  - `apps/worker` — a long-running loop (self-host, Railway/Fly), second-level precision.
  - `GET /api/cron/dispatch` — a Vercel Cron route, so the hosted version can run on Vercel alone at minute-level precision.
- **Crash safety.** A row stuck in `SENDING` past a lease timeout is reclaimed and retried.
- **No horizon limit.** Schedule an email for next year if you want.

## 5. Domain model

- **User** — dashboard login (email/password, GitHub, Google via Better Auth).
- **Project** — tenant boundary. Owns API keys, providers, emails.
- **ApiKey** — `mc_live_…`; only a SHA-256 hash is stored. Scopes: `emails:write`, `emails:read`. Optional daily send quota (agent guardrail).
- **Provider** — `MOCK | SMTP | RESEND | SES | POSTMARK`; credentials encrypted at rest (AES-256-GCM, `MAILCLOCK_ENCRYPTION_KEY`); `ratePerHour`; `priority`; one default per project.
- **Email** — from, to/cc/bcc, subject, html/text, tags, metadata, `idempotencyKey`, `sendAt`, `status`, `attempts`, `maxAttempts`, `nextAttemptAt`, `providerMessageId`, `lastError`, `source` (`DASHBOARD | API | MCP | CLI`), `actor`.
- **EmailEvent** — append-only timeline: `CREATED, RESCHEDULED, CANCELLED, ATTEMPT_STARTED, SENT, ATTEMPT_FAILED, FAILED, RETRY_REQUESTED, RATE_LIMITED`.

### Email lifecycle

```
SCHEDULED ──► SENDING ──► SENT
   │  ▲          │
   │  └─ RETRYING ◄┘ (transient error, backoff 30s·2^n, max 5)
   │             └──► FAILED (attempts exhausted / permanent error) ──► manual retry → SCHEDULED
   └──► CANCELLED
```

## 6. Public REST API (`/api/v1`, `Authorization: Bearer mc_live_…`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/emails` | Schedule one email (`sendAt` optional = now). Honours `Idempotency-Key` header. |
| `POST` | `/emails/batch` | Schedule up to 1,000 emails with optional `staggerSeconds` |
| `GET` | `/emails` | List; filter by `status`, `tag`, `to`, date range; cursor pagination |
| `GET` | `/emails/:id` | Email + event timeline |
| `PATCH` | `/emails/:id` | Reschedule (`sendAt`) while `SCHEDULED`/`RETRYING` |
| `POST` | `/emails/:id/cancel` | Cancel while not yet sent |
| `POST` | `/emails/:id/retry` | Re-queue a `FAILED` email |
| `GET` | `/stats` | Counts per status + last-24h sent/failed |

Errors: `{ "error": { "code": "validation_error", "message": "…" } }` with proper HTTP status.

## 7. MCP server (Phase 2)

Remote (Streamable HTTP at `/api/mcp`, API-key auth) and local (`@mailclock/mcp`, stdio).

| Tool | Annotation |
|---|---|
| `schedule_email` | — |
| `schedule_batch` | — |
| `list_emails` | readOnly |
| `get_email` | readOnly |
| `get_stats` | readOnly |
| `reschedule_email` | idempotent |
| `cancel_email` | destructive |
| `retry_email` | — |

**Agent guardrails:** per-key daily quota, optional `requireApproval` (agent-created emails land in `PENDING_APPROVAL` until a human approves in the dashboard), every action attributed to the key in the timeline.

## 8. Dashboard

- **Overview** — today's outgoing, sent/failed (24h), upcoming queue, provider rate-limit headroom.
- **Emails** — filterable table (status, tag, source, search) → detail drawer with full timeline, provider response, actions (cancel, reschedule, retry).
- **Failed** — triage inbox for `FAILED` emails, bulk retry.
- **Compose** — schedule from the UI (single or CSV batch).
- **API keys**, **Providers**, **Connect** (copy-paste MCP config for Claude Desktop / Claude Code / Cursor, SDK & curl snippets), **Settings**.
- Public **landing page** for the hosted version.

## 9. Roadmap

| Phase | Scope |
|---|---|
| **1 — Foundation** | Monorepo, schema, auth, projects, API keys, encrypted providers (Mock/SMTP/Resend), Postgres dispatcher + worker + cron route, REST v1, new dashboard, Docker Compose, `.env.example`, README |
| **2 — Agents** | Remote MCP endpoint, guardrails (quota, approval queue), `mailclock-cli` repo: SDK, CLI, stdio MCP |
| **3 — Product** | Signed webhooks, templates (React Email + variables), suppression list, send windows / quiet hours, SES + Postmark, provider failover, audit log, landing page |
| **4 — Ecosystem** | `mailclock-docs`, OpenAPI spec, one-click deploy (Railway / Vercel / Coolify), open/click tracking |

## 10. Non-goals (for now)

Newsletter list management, a visual journey builder, inbound email.
