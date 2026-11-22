// The email lifecycle module: the only code that changes an email's status or writes its events.
//
// Every move is one transaction: a guarded UPDATE (the email must still be in an expected status,
// and for the dispatcher still leased to the caller), then the event rows, written only when the
// row actually moved. Callers say what should happen; they never write `email` status or
// `email_event` rows themselves (scripts/ownership-check.mjs rejects that outside this file).
import { Prisma, prisma, type EmailEventType, type EmailSource, type EmailStatus } from "@mailclock/db";

// ─── Event payloads ──────────────────────────────────────────────────────────

/** The `data` written for each event type. Readers get these types back from readEvents(). */
export type EventData = {
  CREATED: { sendAt: string; source: EmailSource };
  RESCHEDULED: { sendAt: string };
  CANCELLED: null;
  RETRY_REQUESTED: null;
  /** Reserved in the schema; nothing writes it. */
  ATTEMPT_STARTED: { attempt: number };
  RATE_LIMITED: { provider: string; ratePerHour: number | null; retryAt: string };
  SENT: { attempt: number; messageId: string; provider: string };
  ATTEMPT_FAILED: { attempt: number; error: string; retryAt?: string };
  /** `permanent`: the provider rejected it outright, as opposed to running out of retries. */
  FAILED: { attempts: number; error: string; permanent: boolean };
};

export type EmailEventInput = { [K in EmailEventType]: { type: K; data: EventData[K]; actor?: string | null } }[EmailEventType];
export type EmailEventView = { [K in EmailEventType]: { type: K; data: EventData[K]; actor: string | null; at: Date } }[EmailEventType];

const toRow = (emailId: string, e: EmailEventInput): Prisma.EmailEventCreateManyInput => ({
  emailId,
  type: e.type,
  actor: e.actor ?? null,
  data: e.data === null ? Prisma.DbNull : (e.data as Prisma.InputJsonValue),
});

/** Nested-create input for the CREATED event, used when inserting a new email. */
export function createdEvent(actor: string, data: EventData["CREATED"]) {
  return { create: { type: "CREATED" as const, actor, data } };
}

/**
 * Inserts many new emails and their CREATED events in one transaction: two multi-row INSERTs
 * regardless of batch size (one INSERT per email exceeded the 5s transaction timeout at a few
 * hundred rows). Returns the emails in input order.
 */
export async function insertEmails(rows: (Prisma.EmailCreateManyInput & { id: string; actor: string; source: EmailSource })[]) {
  const events = rows.map((r) =>
    toRow(r.id, { type: "CREATED", actor: r.actor, data: { sendAt: new Date(r.sendAt).toISOString(), source: r.source } }),
  );
  const inserted = await prisma.$transaction(async (tx) => {
    const emails = await tx.email.createManyAndReturn({ data: rows });
    await tx.emailEvent.createMany({ data: events });
    return emails;
  });
  // RETURNING order is not guaranteed; restore input order.
  const byId = new Map(inserted.map((e) => [e.id, e]));
  return rows.map((r) => byId.get(r.id)!);
}

/** The single place stored JSON becomes typed event payloads. */
export function readEvents(rows: { type: EmailEventType; data: unknown; actor: string | null; createdAt: Date }[]): EmailEventView[] {
  return rows.map((r) => ({ type: r.type, data: r.data, actor: r.actor, at: r.createdAt }) as EmailEventView);
}

// ─── Moves ───────────────────────────────────────────────────────────────────

export type MoveGuard = {
  id: string;
  /** The email must currently be in one of these statuses. */
  from: readonly EmailStatus[];
  /** Tenant scoping for user/API moves. */
  projectId?: string;
  /** Lease ownership for dispatcher moves. */
  lockedBy?: string;
};

/**
 * Applies one guarded change and its events atomically.
 * Returns false, and writes nothing, when the guard does not match (wrong status, wrong project,
 * or the lease now belongs to another runner).
 */
export async function moveEmail(guard: MoveGuard, patch: Prisma.EmailUncheckedUpdateManyInput, events: EmailEventInput[]): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.email.updateMany({
      where: {
        id: guard.id,
        status: { in: [...guard.from] },
        ...(guard.projectId && { projectId: guard.projectId }),
        ...(guard.lockedBy && { lockedBy: guard.lockedBy }),
      },
      data: patch,
    });
    if (count !== 1) return false;
    if (events.length) await tx.emailEvent.createMany({ data: events.map((e) => toRow(guard.id, e)) });
    return true;
  });
}

/**
 * Atomically leases up to `limit` due emails (and emails whose lease expired) for `workerId`.
 * SKIP LOCKED lets any number of runners call this concurrently without double-claiming.
 */
export async function claimDue(workerId: string, limit: number, leaseSeconds: number): Promise<string[]> {
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

/** Guard for moves out of SENDING: only the runner holding the lease may make them. */
export const leasedBy = (id: string, workerId: string): MoveGuard => ({ id, from: ["SENDING"], lockedBy: workerId });

/** Patch fields that release a lease. */
export const releaseLease = { lockedAt: null, lockedBy: null } as const;
