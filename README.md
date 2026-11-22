# Mailclock

**Open-source email scheduling for apps and AI agents.** Schedule emails from your backend, the dashboard, or any MCP client (Claude, Cursor, …), and see exactly what was scheduled, sent, retried, and failed.

- **Postgres is the only dependency.** The emails table is the queue. No Redis, no separate cron daemon.
- **MCP-native.** AI agents can schedule, reschedule, cancel, and check on emails, with per-key daily limits and request rate limits.
- **Bring your provider.** SMTP or Resend, with credentials encrypted at rest. Switch providers without touching your app.
- **A dashboard you can read.** A 24-hour send timeline, a failed-email inbox with one-click resend, and a full history of every attempt.
- **MIT licensed.**

---

## Contents

- [How it works](#how-it-works)
- [Quick start (local development)](#quick-start-local-development)
- [Self-host with Docker](#self-host-with-docker)
- [Deploy to Vercel](#deploy-to-vercel)
- [Sending email: providers](#sending-email-providers)
- [Using the API](#using-the-api)
- [Connecting an AI agent (MCP)](#connecting-an-ai-agent-mcp)
- [Accounts and security](#accounts-and-security)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Development](#development)
- [Roadmap](#roadmap)

## How it works

```
  Your app ────────┐
  Dashboard ───────┼──► apps/web ─────► Postgres ◄──── dispatcher ───► SMTP / Resend
  MCP client ──────┘   REST API, MCP,   (email rows     (worker or cron route) claims
                       dashboard         are the queue)  due rows with SKIP LOCKED
```

1. Scheduling an email writes one row to Postgres with a `sendAt` time. There is no second queue to keep in sync.
2. A dispatcher leases due rows with `SELECT … FOR UPDATE SKIP LOCKED`, so any number of dispatchers can run side by side without sending anything twice.
3. Each send is recorded on the email's timeline. **Permanent** errors (bad address, rejected credentials) fail immediately. **Temporary** ones retry with exponential backoff: 30 s, 1 m, 2 m … capped at 1 h, with ±20% jitter. Each email gets 5 attempts by default (`maxAttempts`, 1–10).
4. If a dispatcher crashes mid-send, its lease expires (120 s by default) and another one picks the email up.
5. A provider can have an **hourly limit**. Emails over the limit wait for the next free slot instead of failing.

The dispatcher can run in two ways, and you can use both at once:

| Runner | Where | How often it sends |
|---|---|---|
| `apps/worker` | Any long-running host (Docker, Railway, Fly, a VM) | Every ~2 seconds |
| `GET /api/cron/dispatch` | Called on a schedule, with `Authorization: Bearer $CRON_SECRET` | As often as it is called. `apps/web/vercel.json` calls it daily (the Vercel Hobby limit); an external scheduler or Vercel Pro can call it every minute. |

> **Delivery guarantee:** at-least-once. If a dispatcher dies after the provider accepted an email but before the result was saved, the email can be sent again. Resend de-duplicates using the email ID as an idempotency key; plain SMTP cannot.

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
#    (.npmrc blocks dependency install scripts, so generating the client is an explicit step)
npm install
npm run db:generate
npm run db:deploy

# 4. Run the web app and the worker
npm run dev
```

Open http://localhost:3000 and create an account. New accounts confirm their email first: with `MAILCLOCK_SYSTEM_EMAIL="log"` (the default in `.env.example`), the confirmation link is printed in the terminal running `npm run dev`. Open it to finish signing up.

Your first project comes with a **Mock** provider, so you can schedule an email right away and watch it move through the dashboard. Nothing leaves Mailclock. Send to `bounce@…` to see a permanent failure, or to `flaky@…` to see retries. When you're ready to send real email, add a provider under **Providers** (see [Sending email](#sending-email-providers)).

## Self-host with Docker

Runs Postgres, the web app, the worker, and a one-off migration job:

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET and MAILCLOCK_ENCRYPTION_KEY (openssl rand -base64 32),
# BETTER_AUTH_URL to the address people will use, and MAILCLOCK_SYSTEM_EMAIL (see below).
docker compose --profile app up -d --build
```

- The app listens on port 3000. Anyone reaching it from another machine should go through a reverse proxy with TLS (Caddy, nginx, Traefik); set `BETTER_AUTH_URL` to that `https://` address.
- With `MAILCLOCK_SYSTEM_EMAIL="log"`, sign-up confirmation links appear in `docker compose logs web`. For other people to sign up, use `resend` or `smtp`.
- Behind your own proxy, set `MAILCLOCK_CLIENT_IP_HEADER` to a header the proxy overwrites, so sign-in rate limits cannot be dodged with a forged `X-Forwarded-For`.
- Using a local SMTP relay (a Mailpit container, `localhost:25`)? Set `MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS=true`.
- Changing the database password: set `POSTGRES_PASSWORD` in `.env`. Compose passes it to Postgres and builds the app's `DATABASE_URL` from it.
- More sending capacity: `docker compose --profile app up -d --scale worker=3`.

## Deploy to Vercel

1. **Create a project** with **Root Directory** `apps/web`. `apps/web/vercel.json` already sets the install command (`npm ci` from the repo root, as in CI) and a daily cron.
2. **Add a Postgres database.** Neon from the Vercel Marketplace sets `DATABASE_URL` for you. Then create the tables once, from your machine, using the **direct (unpooled)** connection string:
   ```bash
   DATABASE_URL="postgres://…unpooled…" npm run db:deploy
   ```
3. **Set environment variables** for Production (and Preview if you use it):

   | Variable | Value |
   |---|---|
   | `BETTER_AUTH_URL` | Your production URL, e.g. `https://your-app.vercel.app` (Production only; previews work it out per request) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `MAILCLOCK_ENCRYPTION_KEY` | `openssl rand -base64 32`. Never change it once providers are saved. |
   | `CRON_SECRET` | **At least 32 characters**, e.g. `openssl rand -hex 32`. Shorter values make the cron route refuse every call. |
   | `MAILCLOCK_SYSTEM_EMAIL` | `resend` (or `smtp`). Without it `/api/health` returns 503 and nobody can confirm a new account. Use `log` on Preview so test deployments never email real people. |
   | `MAILCLOCK_SYSTEM_EMAIL_FROM` | e.g. `Mailclock <no-reply@yourdomain.com>`, on a domain verified with your provider |
   | `MAILCLOCK_SYSTEM_RESEND_API_KEY` | A Resend key with sending access (or the `MAILCLOCK_SYSTEM_SMTP_*` variables for `smtp`) |

4. **Deploy**, then send email every minute. Vercel Hobby only runs crons once a day, so the built-in cron is a safety net. Pick one:
   - an external scheduler (for example cron-job.org) calling `GET https://<your-app>/api/cron/dispatch` every minute with the header `Authorization: Bearer <CRON_SECRET>`;
   - `apps/worker` on an always-on host (Railway, Fly, Render) with the same `DATABASE_URL` and `MAILCLOCK_ENCRYPTION_KEY`;
   - on Vercel Pro, change the schedule in `apps/web/vercel.json` to `* * * * *`.

Check the deployment with `GET /api/health`: it answers `{"status":"ok"}` once the database is reachable and account email is configured.

## Sending email: providers

Each project sends through its own provider, added under **Providers**. Credentials are encrypted before they are stored.

| Provider | Notes |
|---|---|
| **Resend** | Use an API key with **sending access**. The From address must be on a domain you have verified in Resend; webmail addresses (gmail.com, outlook.com, …) are refused because Resend can never send from them. For a first test, `onboarding@resend.dev` works but only delivers to your own Resend account email. |
| **SMTP** | Any SMTP server. Encryption is required: **STARTTLS** (port 587, default) or **TLS from the start** (port 465). Turning it off is only allowed for a local relay (`localhost` or a container name). Hosts must be public addresses unless `MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS=true`. |
| **Mock** | Sends nothing. For development and demos. |

"Test the connection before saving" checks the credentials without sending an email.

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
| `POST` | `/api/v1/emails` | Schedule one email. Omit `sendAt` to send now. `201` when created, `200` when an idempotency key matched an existing email. |
| `POST` | `/api/v1/emails/batch` | Schedule up to 1,000 emails in one transaction: `{ "emails": [...], "staggerSeconds": 60 }`. Emails whose `idempotencyKey` already exists are skipped and listed in `duplicates`. |
| `GET` | `/api/v1/emails` | List emails, newest first. Query: `status`, `tag`, `source`, `q` (subject text or exact recipient), `limit` (1–100, default 25), `cursor` (from `nextCursor`) |
| `GET` | `/api/v1/emails/:id` | One email with its full event timeline |
| `PATCH` | `/api/v1/emails/:id` | Reschedule: `{ "sendAt": "…" }` while `SCHEDULED` or `RETRYING` |
| `POST` | `/api/v1/emails/:id/cancel` | Cancel while `SCHEDULED` or `RETRYING` |
| `POST` | `/api/v1/emails/:id/retry` | Queue a `FAILED` email for another round of attempts |
| `GET` | `/api/v1/stats` | Counts by status, sent and failed in the last 24 h, scheduled for the next 24 h |

**Email fields:** `to` (an address or a list of up to 50; all receive the same email), `subject`, `text` and/or `html`. Optional: `from` (required if the provider has no default From), `cc` and `bcc` (up to 50 each), `replyTo`, `sendAt` (ISO 8601 with an offset; more than 60 s in the past is rejected), `tags`, `metadata`, `providerId`, `idempotencyKey`, `maxAttempts` (1–10).

**Statuses:** `SCHEDULED` → `SENDING` → `SENT`; on a temporary failure `RETRYING` → … → `SENT` or `FAILED`; or `CANCELLED`.

**Idempotency:** repeat a request with the same `Idempotency-Key` header (or `idempotencyKey` field) and you get the original email back (`200`, `"created": false`) instead of a duplicate. The body of the repeat is not compared, so use a new key for a different email. The batch endpoint uses each email's `idempotencyKey`, not the header.

**Rate limits:** each API key may make 120 requests a minute (REST and MCP combined; `MAILCLOCK_API_RATE_LIMIT_PER_MINUTE`). Over the limit you get `429` with a `Retry-After` header. Keys can also have a **daily limit** on how many emails they schedule.

**Errors** look like `{ "error": { "code": "validation_error", "message": "…", "details": … } }`:

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 400 | The request body or query is invalid |
| `unauthorized` | 401 | Missing, malformed, or revoked API key |
| `forbidden` | 403 | The key lacks the scope (read-only keys cannot schedule) |
| `not_found` | 404 | No such email or provider in this project |
| `invalid_state` / `conflict` | 409 | The email's status does not allow the action |
| `no_provider` | 422 | The project has no provider yet |
| `quota_exceeded` | 429 | The key's daily limit is used up |
| `rate_limited` | 429 | Too many requests; see `Retry-After` |
| `internal_error` | 500 | Something went wrong on the server |

## Connecting an AI agent (MCP)

Mailclock serves a remote MCP endpoint at `/api/mcp` (Streamable HTTP). Create an API key (preferably with a **daily limit**), then add it to your client.

**Claude Code**

```bash
claude mcp add --transport http mailclock https://your-mailclock/api/mcp \
  --header "Authorization: Bearer mc_live_…"
```

**Cursor and other clients that support remote servers with headers** (JSON config, e.g. `.cursor/mcp.json` or a project `.mcp.json`):

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

**Clients that only run local (stdio) servers**, such as Claude Desktop's config file, can reach it through the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "mailclock": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-mailclock/api/mcp", "--header", "Authorization: Bearer mc_live_…"]
    }
  }
}
```

| Tool | What it does | Needs |
|---|---|---|
| `schedule_email` | Schedule one email, now or later | `emails:write` |
| `schedule_batch` | Same email to many recipients, optionally spaced out | `emails:write` |
| `reschedule_email` | Move a pending email | `emails:write` |
| `cancel_email` | Cancel a pending email (marked destructive, so clients ask first) | `emails:write` |
| `retry_email` | Send a failed email again | `emails:write` |
| `list_emails` / `get_email` | Check what's scheduled, sent, or failed, with the full history | `emails:read` |
| `get_stats` | Delivery counts | `emails:read` |

**Guardrails for agents:**
- A key only sees the tools its scopes allow; read-only keys get the read tools.
- Daily limits cap how many emails a key can schedule; rate limits cap how fast it can call.
- Every email records which key created it, so the dashboard shows "Scheduled by an AI agent (MCP)" and the key's name.

## Accounts and security

- **Email confirmation:** password sign-ups confirm their address before they can sign in; signing in unconfirmed sends a fresh link. Forgotten passwords are reset by email (links work once, for an hour).
- **GitHub / Google sign-in** (optional): set the client ID and secret, and register the callback URL `<BETTER_AUTH_URL>/api/auth/callback/github` (or `/google`) with the provider.
- **Rate limits:** sign-in 10 attempts per 15 minutes per IP, sign-up 10 per hour, reset and confirmation emails 5 per 15 minutes; API keys 120 requests a minute. Stored in Postgres, so they hold across every server instance.
- **Headers:** pages send a per-request nonce Content-Security-Policy; every response sends HSTS, `X-Frame-Options: DENY`, `nosniff`, and a strict referrer policy.
- **Secrets:** API keys are stored hashed; provider credentials are encrypted with `MAILCLOCK_ENCRYPTION_KEY` (AES-256-GCM).

## Configuration

All configuration is through environment variables; [`.env.example`](.env.example) lists them with comments.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `BETTER_AUTH_URL` | Yes | Public URL of the web app (used for sign-in callbacks and email links) |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret (32+ random bytes) |
| `MAILCLOCK_ENCRYPTION_KEY` | Yes | 32 random bytes, base64. Encrypts provider credentials; placeholder values are refused. **Do not change it** once providers are saved. |
| `MAILCLOCK_SYSTEM_EMAIL` | Yes | How account emails (confirmation, password reset) are sent: `resend`, `smtp`, or `log` (links printed to the server log). `/api/health` returns 503 without it. |
| `MAILCLOCK_SYSTEM_EMAIL_FROM` | With resend/smtp | Sender for account emails, e.g. `Mailclock <no-reply@yourdomain.com>` |
| `MAILCLOCK_SYSTEM_RESEND_API_KEY` | With resend | Resend key with sending access |
| `MAILCLOCK_SYSTEM_SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_TLS` | With smtp | SMTP server for account emails. `_TLS`: `starttls` (default), `implicit`, or `none` (local relay only). |
| `CRON_SECRET` | For the cron route | At least 32 characters. Protects `/api/cron/dispatch`. |
| `GITHUB_CLIENT_ID` / `_SECRET` | No | Enables "Continue with GitHub" |
| `GOOGLE_CLIENT_ID` / `_SECRET` | No | Enables "Continue with Google" |
| `MAILCLOCK_API_RATE_LIMIT_PER_MINUTE` | No | Requests per minute per API key, REST and MCP combined (default 120) |
| `MAILCLOCK_CLIENT_IP_HEADER` | No | Header carrying the real client IP for sign-in rate limits (default `x-forwarded-for`, which Vercel sets). Behind your own proxy, use a header it overwrites. |
| `MAILCLOCK_ALLOW_PRIVATE_SMTP_HOSTS` | No | `true` lets SMTP hosts (providers and account email) be local or private addresses. Off by default so the connection test cannot probe your network. |
| `POSTGRES_PASSWORD` | No | Docker Compose only: the database password (default `mailclock`) |
| `WORKER_POLL_INTERVAL_MS` | No | How often the worker checks for due emails (default 2000, min 200) |
| `WORKER_BATCH_SIZE` | No | Emails claimed per round (default 25, 1–500) |
| `WORKER_CONCURRENCY` | No | Parallel sends per worker (default 5, 1–50) |
| `WORKER_LEASE_SECONDS` | No | After this long, a stuck send is reclaimed (default 120, 30–3600) |

The worker refuses to start on an invalid value instead of running with it; a blank value means "use the default".

## Project structure

```
apps/
  web/        Next.js 16: dashboard, REST API (/api/v1), MCP (/api/mcp), auth, cron route
  worker/     Long-running dispatcher
packages/
  core/       Scheduling, lifecycle, dispatcher, providers, API keys, rate limits, encryption
  db/         Prisma schema, migrations, client
scripts/      The repository's quality checks (see CONSTRAINTS.md)
docs/
  SPEC.md     Product and technical spec
```

Planned companion repositories (empty for now): [`mailclock-cli`](https://github.com/ankit-tiwari-dev/mailclock-cli) for a CLI, TypeScript SDK, and local stdio MCP server, and [`mailclock-docs`](https://github.com/ankit-tiwari-dev/mailclock-docs) for a documentation site.

## Development

```bash
npm run dev            # web + worker
npm run typecheck      # all workspaces
npm test               # core tests (needs the test database, below)
npm run check:task     # everything a change must pass locally (see CONSTRAINTS.md)
npm run db:migrate     # create a migration after editing packages/db/prisma/schema.prisma
```

The core tests run against a real Postgres (the queue relies on row locking, which mocks can't verify). Create the test database once:

```bash
docker compose exec db psql -U mailclock -c "CREATE DATABASE mailclock_test"
DATABASE_URL=postgresql://mailclock:mailclock@127.0.0.1:5432/mailclock_test npm run db:deploy
npm test
```

On PowerShell, set the variable first: `$env:DATABASE_URL="postgresql://…/mailclock_test"; npm run db:deploy`. To point the tests at a different database, set `TEST_DATABASE_URL`.

`npm run check:task` compares your branch with `origin/main`, so run `git fetch origin` first in a fresh clone or fork. Contribution rules and the checks behind them are in [`CONSTRAINTS.md`](CONSTRAINTS.md) and [`CLAUDE.md`](CLAUDE.md).

## Roadmap

- [x] Postgres-backed queue, worker, and cron dispatch
- [x] REST API with API keys, scopes, idempotency, daily limits, and rate limits
- [x] Remote MCP server
- [x] Dashboard: timeline, failed inbox, per-email history, compose with CSV import, providers, keys
- [x] Email confirmation, password reset, security headers
- [ ] `mailclock` CLI, `@mailclock/sdk`, and a local stdio MCP server
- [ ] Signed webhooks for sent, failed, and bounced events
- [ ] Templates with variables (React Email)
- [ ] Suppression list, send windows, and quiet hours
- [ ] Amazon SES and Postmark providers, with automatic failover
- [ ] Human approval queue for agent-created emails
- [ ] Data retention settings and account deletion
- [ ] Docs site and one-click deploy buttons

See [docs/SPEC.md](docs/SPEC.md) for the plan. Contributions are welcome; open an issue to discuss bigger changes first.

## License

[MIT](LICENSE) © Ankit Tiwari
