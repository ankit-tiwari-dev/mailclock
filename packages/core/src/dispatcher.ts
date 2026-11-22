import { prisma, type Email, type Provider } from "@mailclock/db";
import { ZodError } from "zod";
import { ProviderError, transportForProvider, type EmailTransport } from "./providers";

export type DispatchOptions = {
  /** Identifies this runner in leases, e.g. "worker-<hostname>-<pid>" or "cron". */
  workerId: string;
  batchSize?: number;
  /** A SENDING row whose lease is older than this is assumed orphaned and reclaimed. */
  leaseSeconds?: number;
  concurrency?: number;
  /** Stop picking up new batches after this many ms (keeps serverless invocations bounded). */
  timeBudgetMs?: number;
};

export type DispatchResult = { claimed: number; sent: number; retrying: number; failed: number; rateLimited: number };

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/** Exponential backoff with ±20% jitter: 30s, 60s, 2m, 4m … capped at 1h. */
export function backoffMs(attempt: number, random = Math.random): number {
  const raw = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (0.8 + random() * 0.4));
}

export function isPermanentError(err: unknown): boolean {
  if (err instanceof ProviderError) return err.permanent;
  // Invalid stored credentials will not fix themselves on retry.
  return err instanceof ZodError;
}

// ─── Transport cache ─────────────────────────────────────────────────────────
// Reuses SMTP connection pools across ticks; a provider edit changes updatedAt and busts the entry.

const transports = new Map<string, { version: number; transport: EmailTransport }>();

function getTransport(provider: Provider): EmailTransport {
  const cached = transports.get(provider.id);
  const version = provider.updatedAt.getTime();
  if (cached?.version === version) return cached.transport;
  cached?.transport.close?.();
  const transport = transportForProvider(provider);
  transports.set(provider.id, { version, transport });
  return transport;
}

export function closeTransports() {
  for (const { transport } of transports.values()) transport.close?.();
  transports.clear();
}

// ─── Claiming ────────────────────────────────────────────────────────────────

/**
 * Atomically leases up to `limit` due emails. SKIP LOCKED lets any number of
 * workers (and the cron route) run concurrently without double-claiming.
 */
async function claimDue(workerId: string, limit: number, leaseSeconds: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id FROM email
      WHERE (status IN ('SCHEDULED', 'RETRYING') AND "nextAttemptAt" <= now())
         OR (status = 'SENDING' AND "lockedAt" < now() - (${leaseSeconds}::int * interval '1 second'))
      ORDER BY "nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email AS e
    SET status = 'SENDING', "lockedAt" = now(), "lockedBy" = ${workerId},
        attempts = e.attempts + 1, "updatedAt" = now()
    FROM due WHERE e.id = due.id
    RETURNING e.id`;
  return rows.map((r) => r.id);
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

/** Tracks per-provider hourly budgets within one dispatch tick. */
class RateBudget {
  /** One shared lookup per provider; concurrent sends await the same promise. */
  private initial = new Map<string, Promise<number>>();
  private reserved = new Map<string, number>();

  /** Returns null if a send is allowed (and reserves it), else the time the window frees up. */
  async reserve(provider: Provider): Promise<Date | null> {
    if (!provider.ratePerHour) return null;
    const windowStart = new Date(Date.now() - 3_600_000);
    let initial = this.initial.get(provider.id);
    if (!initial) {
      initial = prisma.email.count({ where: { providerId: provider.id, sentAt: { gte: windowStart } } });
      this.initial.set(provider.id, initial);
    }
    const alreadySent = await initial;
    // Everything below runs synchronously after the await, so reservations cannot interleave.
    const reserved = this.reserved.get(provider.id) ?? 0;
    if (alreadySent + reserved < provider.ratePerHour) {
      this.reserved.set(provider.id, reserved + 1);
      return null;
    }
    const oldest = await prisma.email.findFirst({
      where: { providerId: provider.id, sentAt: { gte: windowStart } },
      orderBy: { sentAt: "asc" },
      select: { sentAt: true },
    });
    return new Date((oldest?.sentAt?.getTime() ?? Date.now()) + 3_600_000 + 1_000);
  }
}

// ─── Processing ──────────────────────────────────────────────────────────────

type ClaimedEmail = Email & { provider: Provider | null };
type Outcome = "sent" | "retrying" | "failed" | "rateLimited" | "lost";

/** Writes guarded by lockedBy so a worker whose lease was reclaimed cannot clobber the new owner. */
const owned = (email: ClaimedEmail, workerId: string) => ({ id: email.id, lockedBy: workerId, status: "SENDING" as const });

async function processEmail(email: ClaimedEmail, workerId: string, budget: RateBudget): Promise<Outcome> {
  const attempt = email.attempts;

  if (!email.provider) {
    return fail(email, workerId, attempt, "The provider for this email was deleted");
  }

  const retryAt = await budget.reserve(email.provider);
  if (retryAt) {
    const { count } = await prisma.email.updateMany({
      where: owned(email, workerId),
      data: {
        status: attempt > 1 ? "RETRYING" : "SCHEDULED",
        attempts: attempt - 1, // a deferral is not a failed attempt
        nextAttemptAt: retryAt,
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (count) {
      await prisma.emailEvent.create({
        data: {
          emailId: email.id,
          type: "RATE_LIMITED",
          data: { provider: email.provider.name, ratePerHour: email.provider.ratePerHour, retryAt: retryAt.toISOString() },
        },
      });
    }
    return count ? "rateLimited" : "lost";
  }

  try {
    const result = await getTransport(email.provider).send({
      from: email.from ?? email.provider.defaultFrom ?? "",
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: email.id,
    });
    const { count } = await prisma.email.updateMany({
      where: owned(email, workerId),
      data: { status: "SENT", sentAt: new Date(), providerMessageId: result.messageId, lastError: null, lockedAt: null, lockedBy: null },
    });
    await prisma.emailEvent.create({
      data: { emailId: email.id, type: "SENT", data: { attempt, messageId: result.messageId, provider: email.provider.name } },
    });
    return count ? "sent" : "lost";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isPermanentError(err) || attempt >= email.maxAttempts) {
      return fail(email, workerId, attempt, message);
    }
    const next = new Date(Date.now() + backoffMs(attempt));
    const { count } = await prisma.email.updateMany({
      where: owned(email, workerId),
      data: { status: "RETRYING", nextAttemptAt: next, lastError: message, lockedAt: null, lockedBy: null },
    });
    await prisma.emailEvent.create({
      data: { emailId: email.id, type: "ATTEMPT_FAILED", data: { attempt, error: message, retryAt: next.toISOString() } },
    });
    return count ? "retrying" : "lost";
  }
}

async function fail(email: ClaimedEmail, workerId: string, attempt: number, message: string): Promise<Outcome> {
  const { count } = await prisma.email.updateMany({
    where: owned(email, workerId),
    data: { status: "FAILED", lastError: message, lockedAt: null, lockedBy: null },
  });
  await prisma.emailEvent.createMany({
    data: [
      { emailId: email.id, type: "ATTEMPT_FAILED", data: { attempt, error: message } },
      { emailId: email.id, type: "FAILED", data: { attempts: attempt, error: message } },
    ],
  });
  return count ? "failed" : "lost";
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Sends every email that is due. Loops over batches until the queue is drained
 * or the time budget runs out. Safe to call from many processes at once.
 */
export async function dispatchDue(opts: DispatchOptions): Promise<DispatchResult> {
  const { workerId, batchSize = 25, leaseSeconds = 120, concurrency = 5, timeBudgetMs = 50_000 } = opts;
  const started = Date.now();
  const result: DispatchResult = { claimed: 0, sent: 0, retrying: 0, failed: 0, rateLimited: 0 };
  const budget = new RateBudget();

  while (Date.now() - started < timeBudgetMs) {
    const ids = await claimDue(workerId, batchSize, leaseSeconds);
    if (ids.length === 0) break;
    result.claimed += ids.length;

    const emails = await prisma.email.findMany({ where: { id: { in: ids } }, include: { provider: true } });
    const outcomes = await mapWithConcurrency(emails, concurrency, (e) => processEmail(e, workerId, budget));
    for (const o of outcomes) if (o !== "lost") result[o] += 1;

    if (ids.length < batchSize) break;
  }
  return result;
}
