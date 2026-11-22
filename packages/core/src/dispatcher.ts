import { prisma, type Email, type Provider } from "@mailclock/db";
import { z, ZodError } from "zod";
import { claimDue, leasedBy, moveEmail, releaseLease } from "./lifecycle";
import { ProviderError, transportForProvider, type EmailTransport } from "./providers";

/**
 * Dispatch settings, validated so that no value can silently break delivery: a lease shorter than
 * a send lets another runner reclaim (and re-send) an email that is still in flight, and a
 * concurrency or batch size of 0/NaN claims emails that are then never processed.
 */
export const dispatchOptionsSchema = z.object({
  /** Unique per live runner; leases are matched on it. */
  workerId: z.string().min(1),
  batchSize: z.number().int().min(1).max(500).default(25),
  /** A SENDING row whose lease is older than this is assumed orphaned and reclaimed. */
  leaseSeconds: z.number().int().min(30).max(3600).default(120),
  concurrency: z.number().int().min(1).max(50).default(5),
  /** Stop picking up new batches after this many ms (keeps serverless invocations bounded). */
  timeBudgetMs: z.number().int().min(1).max(15 * 60_000).default(50_000),
});
export type DispatchOptions = z.input<typeof dispatchOptionsSchema>;

/** Worker settings from the environment. A blank variable means "use the default". */
export const workerEnvSchema = z.object({
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(60_000).default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  WORKER_LEASE_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
});

export function parseWorkerEnv(env: Record<string, string | undefined>) {
  const present = Object.fromEntries(Object.entries(env).filter(([k, v]) => k.startsWith("WORKER_") && v !== undefined && v.trim() !== ""));
  const parsed = workerEnvSchema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid worker settings: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

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

/** Each outcome is one guarded lifecycle move; "lost" means our lease was reclaimed and nothing was written. */
async function processEmail(email: ClaimedEmail, workerId: string, budget: RateBudget): Promise<Outcome> {
  const attempt = email.attempts;
  const guard = leasedBy(email.id, workerId);

  if (!email.provider) {
    return fail(email, workerId, attempt, "The provider for this email was deleted", true);
  }

  const retryAt = await budget.reserve(email.provider);
  if (retryAt) {
    const moved = await moveEmail(
      guard,
      // A deferral is not a failed attempt.
      { status: attempt > 1 ? "RETRYING" : "SCHEDULED", attempts: attempt - 1, nextAttemptAt: retryAt, ...releaseLease },
      [{ type: "RATE_LIMITED", data: { provider: email.provider.name, ratePerHour: email.provider.ratePerHour, retryAt: retryAt.toISOString() } }],
    );
    return moved ? "rateLimited" : "lost";
  }

  let messageId: string;
  try {
    ({ messageId } = await getTransport(email.provider).send({
      from: email.from ?? email.provider.defaultFrom ?? "",
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: email.id,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = isPermanentError(err);
    if (permanent || attempt >= email.maxAttempts) return fail(email, workerId, attempt, message, permanent);
    const next = new Date(Date.now() + backoffMs(attempt));
    const moved = await moveEmail(guard, { status: "RETRYING", nextAttemptAt: next, lastError: message, ...releaseLease }, [
      { type: "ATTEMPT_FAILED", data: { attempt, error: message, retryAt: next.toISOString() } },
    ]);
    return moved ? "retrying" : "lost";
  }

  // Recording the send is outside the try: a database error here must not be mistaken for a
  // failed send (which would retry an email the provider already accepted).
  const moved = await moveEmail(guard, { status: "SENT", sentAt: new Date(), providerMessageId: messageId, lastError: null, ...releaseLease }, [
    { type: "SENT", data: { attempt, messageId, provider: email.provider.name } },
  ]);
  return moved ? "sent" : "lost";
}

async function fail(email: ClaimedEmail, workerId: string, attempt: number, message: string, permanent: boolean): Promise<Outcome> {
  const moved = await moveEmail(leasedBy(email.id, workerId), { status: "FAILED", lastError: message, ...releaseLease }, [
    { type: "ATTEMPT_FAILED", data: { attempt, error: message } },
    { type: "FAILED", data: { attempts: attempt, error: message, permanent } },
  ]);
  return moved ? "failed" : "lost";
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
  const { workerId, batchSize, leaseSeconds, concurrency, timeBudgetMs } = dispatchOptionsSchema.parse(opts);
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
