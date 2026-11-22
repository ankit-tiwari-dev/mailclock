# Mailclock

**Open-source email scheduling for apps and AI agents.** Schedule emails from your backend, your terminal, or any MCP client, and see exactly what was scheduled, sent, retried, and failed.

- **Postgres is the only dependency.** The emails table is the queue. No Redis, no cron daemon.
- **MCP-native.** Claude, Cursor, and other agents can schedule, reschedule, cancel, and check on emails, with per-key daily limits.
- **Bring your provider.** SMTP or Resend, with credentials encrypted at rest. Switch providers without touching your app.
- **A dashboard you can read.** A 24-hour send timeline, a failed-email inbox with one-click resend, and a full history of every attempt.
- **MIT licensed.**

---

## Contents

- [How it works](#how-it-works)
- [Quick start (local development)](#quick-start-local-development)
- [Self-host with Docker](#self-host-with-docker)
- [Deploy to Vercel](#deploy-to-vercel)
- [Using the API](#using-the-api)
- [Connecting an AI agent (MCP)](#connecting-an-ai-agent-mcp)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Development](#development)
- [Roadmap](#roadmap)

## How it works

```
  Your app / CLI ──┐
                   ├──► apps/web ─────► Postgres ◄──── apps/worker ───► SMTP / Resend
  MCP client ──────┘   REST API, MCP,   (email rows     claims due rows with
                       dashboard         are the queue)  FOR UPDATE SKIP LOCKED
```

1. A request to schedule an email writes one row to Postgres with a `sendAt` time. That's it: there is no second queue to keep in sync.
2. A dispatcher leases due rows with `SELECT … FOR UPDATE SKIP LOCKED`, so any number of workers can run side by side without sending anything twice.
3. Each send is recorded on the email's timeline. **Permanent** errors (bad address, rejected credentials) fail immediately. **Temporary** ones retry with exponential backoff (30s, 1m, 2m … up to 1h; 5 attempts by default).
4. If a worker crashes mid-send, its lease expires and another worker picks the email up.
5. A provider can have an **hourly limit**. Emails over the limit wait for the next free slot instead of failing.

The dispatcher runs in two places:

| Runner | Where | Precision |
|---|---|---|
| `apps/worker` | Any long-running host (Docker, Railway, Fly, a VM) | ~2 seconds |
| `GET /api/cron/dispatch` | Vercel Cron, so a Vercel-only deployment works | ~1 minute |

You can run both at once.

> **Delivery guarantee:** at-least-once. If a worker dies after the provider accepted an email but before the result was saved, the email can be sent again. Resend de-duplicates using the email ID as an idempotency key; plain SMTP cannot.

## Quick start (local development)

**You need:** Node.js 22.12+ and Docker (for Postgres).

```bash
git clone https://github.com/ankit-tiwari-dev/mailclock.git
cd mailclock

# 1. Configure
cp .env.example .env
#    Fill in BETTER_AUTH_SECRET and MAILCLOCK_ENCRYPTION_KEY. Generate each with:
#    openssl rand -base64 32
#    (or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 2. Start Postgres
docker compose up -d db

# 3. Install, generate the database client, and create the tables
#    (.npmrc blocks dependency install scripts, so generation is an explicit step)
npm install
npm run db:generate
npm run db:deploy

# 4. Run the web app and the worker
npm run dev
```

Open http://localhost:3000 and create an account. With `MAILCLOCK_SYSTEM_EMAIL="log"` (the default in `.env.example`), the confirmation link is printed in the terminal running `npm run dev`; open it to finish signing up. Your first project comes with a **Mock** provider, so you can schedule an email right away and watch it move through the dashboard. Send to `bounce@…` to see a permanent failure, or to `flaky@…` to see retries.

When you're ready to send real email, add an SMTP or Resend provider under **Providers**.

## Self-host with Docker

Runs Postgres, the web app, the worker, and a one-off migration job:

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET, MAILCLOCK_ENCRYPTION_KEY, BETTER_AUTH_URL
docker compose --profile app up -d --build
```

The app is served on port 3000. Put it behind a reverse proxy with TLS for production, and set `BETTER_AUTH_URL` to the public URL. Set `POSTGRES_PASSWORD` in your shell or `.env` to change the database password.

To scale sending, run more workers: `docker compose --profile app up -d --scale worker=3`.

## Deploy to Vercel

1. Create a Postgres database (Neon, Supabase, or Vercel Postgres) and run the migrations once:
   ```bash
   DATABASE_URL="postgres://…" npm run db:deploy
   ```
2. Import the repo in Vercel and set **Root Directory** to `apps/web`.
3. Add environment variables: `DATABASE_URL`, `BETTER_AUTH_URL` (your Vercel URL), `BETTER_AUTH_SECRET`, `MAILCLOCK_ENCRYPTION_KEY`, and `CRON_SECRET`.
4. Deploy. The Vercel Hobby plan only allows a daily cron, so `apps/web/vercel.json` registers `/api/cron/dispatch` once a day as a safety net. For every-minute sending, either:
   - call `https://<your-app>/api/cron/dispatch` every minute from an external scheduler (for example cron-job.org) with the header `Authorization: Bearer <CRON_SECRET>`, or
   - run `apps/worker` on an always-on host (Railway, Fly, Render) pointed at the same database, or
   - on Vercel Pro, change the schedule in `apps/web/vercel.json` to `* * * * *`.

## Using the API

Create an API key under **API keys** in the dashboard, then:

```bash
curl -X POST https://your-mailclock/api/v1/emails \
  -H "Authorization: Bearer $MAILCLOCK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: welcome-user-42" \
  -d '{
    "to": "ada@example.com",
    "subject": "Welcome aboard",
    "text": "Thanks for signing up.",
    "sendAt": "2026-12-01T09:00:00+05:30",
    "tags": ["onboarding"]
  }'
```

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/emails` | Schedule one email. Omit `sendAt` to send now. |
| `POST` | `/api/v1/emails/batch` | Schedule up to 1,000 emails in one transaction; `staggerSeconds` spaces them out |
| `GET` | `/api/v1/emails` | List emails. Filters: `status`, `tag`, `source`, `q`; paginate with `cursor` |
| `GET` | `/api/v1/emails/:id` | One email with its full event timeline |
| `PATCH` | `/api/v1/emails/:id` | Reschedule: `{ "sendAt": "…" }` |
| `POST` | `/api/v1/emails/:id/cancel` | Cancel before it's sent |
| `POST` | `/api/v1/emails/:id/retry` | Send a failed email again |
| `GET` | `/api/v1/stats` | Counts by status, last 24h sent/failed, next 24h scheduled |

**Email fields:** `to` (string or array, max 50), `subject`, `text` and/or `html`, and optionally `from`, `cc`, `bcc`, `replyTo`, `sendAt` (ISO 8601 with offset), `tags`, `metadata`, `providerId`, `idempotencyKey`, `maxAttempts` (1–10).

**Statuses:** `SCHEDULED` → `SENDING` → `SENT`, or `RETRYING` → … → `FAILED`, or `CANCELLED`.

**Errors** always have the shape `{ "error": { "code": "validation_error", "message": "…" } }`. Codes: `validation_error` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `invalid_state` (409), `no_provider` (422), `quota_exceeded` (429).

**Idempotency:** send the same `Idempotency-Key` header (or `idempotencyKey` field) again and you get the original email back with `200` instead of a duplicate.

## Connecting an AI agent (MCP)

Mailclock serves a remote MCP endpoint at `/api/mcp` (Streamable HTTP). Create an API key (preferably with a **daily limit**), then add it to your client.

**Claude Code**

```bash
claude mcp add --transport http mailclock https://your-mailclock/api/mcp \
  --header "Authorization: Bearer mc_live_…"
```

**Cursor, Claude Desktop, and other clients** (JSON config):

```json
{
  "mcpServers": {
    "mailclock": {
      "type": "http",
      "url": "https://your-mailclock/api/mcp",
      "headers": { "Authorization": "Bearer mc_live_…" }
    }
  }
}
```

| Tool | What it does |
|---|---|
| `schedule_email` | Schedule one email, now or later |
| `schedule_batch` | Same email to many recipients, optionally spaced out |
| `list_emails` / `get_email` | Check what's scheduled, sent, or failed, with the full history |
| `get_stats` | Delivery counts |
| `reschedule_email` | Move a pending email |
| `cancel_email` | Cancel a pending email (marked destructive, so clients ask first) |
| `retry_email` | Send a failed email again |

**Guardrails for agents:**
- Read-only keys only see the read tools.
- Daily limits cap how many emails a key can schedule.
- Every email records which key created it, so the dashboard shows "Scheduled by an AI agent (MCP)" with the key's name.

## Configuration

All configuration is through environment variables. See [`.env.example`](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `BETTER_AUTH_URL` | Yes | Public URL of the web app |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret (32+ random bytes) |
| `MAILCLOCK_ENCRYPTION_KEY` | Yes | 32-byte base64 key that encrypts provider credentials. **Do not change it** once providers are saved. |
| `GITHUB_CLIENT_ID` / `_SECRET` | No | Enables "Continue with GitHub" |
| `GOOGLE_CLIENT_ID` / `_SECRET` | No | Enables "Continue with Google" |
| `CRON_SECRET` | For cron | Protects `/api/cron/dispatch` |
| `MAILCLOCK_SYSTEM_EMAIL` | Yes | How account emails (sign-up confirmation, password reset) are sent: `resend`, `smtp`, or `log` (links printed to the server log, for local development). `/api/health` reports degraded without it. |
| `MAILCLOCK_SYSTEM_EMAIL_FROM` | With resend/smtp | Sender for account emails, e.g. `Mailclock <no-reply@yourdomain.com>` |
| `MAILCLOCK_SYSTEM_RESEND_API_KEY` / `MAILCLOCK_SYSTEM_SMTP_*` | With resend/smtp | Credentials for account emails (see `.env.example`) |
| `MAILCLOCK_API_RATE_LIMIT_PER_MINUTE` | No | Requests per minute per API key, REST and MCP combined (default 120) |
| `MAILCLOCK_CLIENT_IP_HEADER` | No | Header carrying the real client IP for sign-in rate limits (default `x-forwarded-for`, which Vercel sets). Behind your own proxy, use a header it overwrites. |
| `MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS` | No | `true` lets SMTP providers point at local or private addresses (self-hosted relays). Off by default so the connection test cannot probe your network. |
| `WORKER_POLL_INTERVAL_MS` | No | How often the worker checks for due emails (default 2000) |
| `WORKER_BATCH_SIZE` | No | Emails claimed per round (default 25) |
| `WORKER_CONCURRENCY` | No | Parallel sends per worker (default 5) |
| `WORKER_LEASE_SECONDS` | No | After this long, a stuck send is reclaimed (default 120) |

## Project structure

```
apps/
  web/        Next.js 16: dashboard, REST API (/api/v1), MCP (/api/mcp), auth, cron route
  worker/     Long-running dispatcher
packages/
  core/       Scheduling, dispatcher, providers, API keys, encryption (shared by web and worker)
  db/         Prisma schema, migrations, client
docs/
  SPEC.md     Product and technical spec
```

Related repositories:
- [`mailclock-cli`](https://github.com/ankit-tiwari-dev/mailclock-cli): CLI, TypeScript SDK, and local stdio MCP server (in progress)
- [`mailclock-docs`](https://github.com/ankit-tiwari-dev/mailclock-docs): documentation site (in progress)

## Development

```bash
npm run dev            # web + worker
npm run typecheck      # all workspaces
npm test               # core tests (needs the test database, below)
npm run db:migrate     # create a migration after editing packages/db/prisma/schema.prisma
```

The core tests run against a real Postgres (the queue relies on row locking, which mocks can't verify):

```bash
docker compose exec db psql -U mailclock -c "CREATE DATABASE mailclock_test"
DATABASE_URL=postgresql://mailclock:mailclock@127.0.0.1:5432/mailclock_test npm run db:deploy
npm test
```

They cover scheduling, idempotency, batches, permanent and temporary failures, manual retry, lease reclaim after a crash, four dispatchers racing over the same queue, hourly rate limits, and API key quotas.

## Roadmap

- [x] Postgres-backed queue, worker, and Vercel cron dispatch
- [x] REST API with API keys, scopes, idempotency, and daily quotas
- [x] Remote MCP server
- [x] Dashboard: timeline, failed inbox, per-email history, compose with CSV, providers, keys
- [ ] `mailclock` CLI, `@mailclock/sdk`, and a local stdio MCP server
- [ ] Signed webhooks for sent, failed, and bounced events
- [ ] Templates with variables (React Email)
- [ ] Suppression list, send windows, and quiet hours
- [ ] Amazon SES and Postmark providers, with automatic failover
- [ ] Human approval queue for agent-created emails
- [ ] Docs site and one-click deploy buttons

See [docs/SPEC.md](docs/SPEC.md) for the full plan. Contributions are welcome. Open an issue to discuss bigger changes first.

## License

[MIT](LICENSE) © Ankit Tiwari
