import { randomUUID } from "node:crypto";
import { Prisma, prisma, type Email, type EmailSource, type EmailStatus } from "@mailclock/db";
import { MailclockError } from "./errors";
import type { CreateBatch, CreateEmail, ListEmailsQuery } from "./schemas";

/** Who is acting, on which project. Every mutation is attributed to an actor. */
export type ActorContext = {
  projectId: string;
  /** "user:<id>" | "key:<id>" */
  actor: string;
  source: EmailSource;
  /** Present when acting via an API key. */
  apiKey?: { id: string; dailyQuota: number | null };
};

const PENDING: EmailStatus[] = ["SCHEDULED", "RETRYING"];

async function resolveProvider(projectId: string, providerId?: string) {
  const provider = providerId
    ? await prisma.provider.findFirst({ where: { id: providerId, projectId } })
    : await prisma.provider.findFirst({ where: { projectId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (providerId && !provider) throw new MailclockError("not_found", "Provider not found in this project");
  if (!provider) {
    throw new MailclockError("no_provider", "This project has no email provider yet. Add one in the dashboard under Providers.");
  }
  return provider;
}

async function enforceQuota(ctx: ActorContext, count: number) {
  const quota = ctx.apiKey?.dailyQuota;
  if (!quota) return;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await prisma.email.count({ where: { actor: ctx.actor, createdAt: { gte: startOfDay } } });
  if (used + count > quota) {
    throw new MailclockError(
      "quota_exceeded",
      `Daily quota for this API key is ${quota} emails; ${used} already scheduled today.`,
    );
  }
}

function buildCreateData(
  ctx: ActorContext,
  input: CreateEmail,
  provider: { id: string; defaultFrom: string | null },
  sendAt: Date,
): Prisma.EmailUncheckedCreateInput {
  const from = input.from ?? provider.defaultFrom;
  if (!from) {
    throw new MailclockError("validation_error", 'No "from" address given and the provider has no default From address');
  }
  return {
    projectId: ctx.projectId,
    providerId: provider.id,
    idempotencyKey: input.idempotencyKey,
    from,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
    tags: input.tags ?? [],
    metadata: input.metadata as Prisma.InputJsonValue | undefined,
    sendAt,
    nextAttemptAt: sendAt,
    maxAttempts: input.maxAttempts ?? 5,
    source: ctx.source,
    actor: ctx.actor,
    events: {
      create: { type: "CREATED", actor: ctx.actor, data: { sendAt: sendAt.toISOString(), source: ctx.source } },
    },
  };
}

function normaliseSendAt(sendAt: Date | undefined, now = Date.now()): Date {
  if (!sendAt) return new Date(now);
  if (Number.isNaN(sendAt.getTime())) throw new MailclockError("validation_error", "sendAt is not a valid date");
  // Allow a small clock-skew window; anything older is almost certainly a caller bug.
  if (sendAt.getTime() < now - 60_000) throw new MailclockError("validation_error", "sendAt is in the past");
  return sendAt.getTime() < now ? new Date(now) : sendAt;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const byKey = (projectId: string, idempotencyKey: string) => ({
  projectId_idempotencyKey: { projectId, idempotencyKey },
});

/** Schedules one email. Re-sending the same idempotencyKey returns the original email. */
export async function scheduleEmail(ctx: ActorContext, input: CreateEmail): Promise<{ email: Email; created: boolean }> {
  if (input.idempotencyKey) {
    const existing = await prisma.email.findUnique({ where: byKey(ctx.projectId, input.idempotencyKey) });
    if (existing) return { email: existing, created: false };
  }
  const provider = await resolveProvider(ctx.projectId, input.providerId);
  await enforceQuota(ctx, 1);
  const data = buildCreateData(ctx, input, provider, normaliseSendAt(input.sendAt));
  try {
    return { email: await prisma.email.create({ data }), created: true };
  } catch (e) {
    // Two concurrent requests with the same key: the loser returns the winner's row.
    if (isUniqueViolation(e) && input.idempotencyKey) {
      return { email: await prisma.email.findUniqueOrThrow({ where: byKey(ctx.projectId, input.idempotencyKey) }), created: false };
    }
    throw e;
  }
}

/** Schedules many emails atomically, optionally spaced out by `staggerSeconds`. */
export async function scheduleBatch(ctx: ActorContext, input: CreateBatch) {
  const keys = input.emails.map((e) => e.idempotencyKey).filter((k): k is string => !!k);
  if (new Set(keys).size !== keys.length) {
    throw new MailclockError("validation_error", "Duplicate idempotencyKey within the batch");
  }
  const existing = keys.length
    ? await prisma.email.findMany({ where: { projectId: ctx.projectId, idempotencyKey: { in: keys } } })
    : [];
  const existingKeys = new Set(existing.map((e) => e.idempotencyKey));
  const fresh = input.emails.filter((e) => !e.idempotencyKey || !existingKeys.has(e.idempotencyKey));

  await enforceQuota(ctx, fresh.length);
  const providers = new Map<string, Awaited<ReturnType<typeof resolveProvider>>>();
  const now = Date.now();
  const stagger = (input.staggerSeconds ?? 0) * 1000;

  const data: Prisma.EmailUncheckedCreateInput[] = [];
  for (const [i, email] of fresh.entries()) {
    const cacheKey = email.providerId ?? "default";
    let provider = providers.get(cacheKey);
    if (!provider) {
      provider = await resolveProvider(ctx.projectId, email.providerId);
      providers.set(cacheKey, provider);
    }
    const base = normaliseSendAt(email.sendAt, now);
    data.push(buildCreateData(ctx, email, provider, new Date(base.getTime() + i * stagger)));
  }

  // Two statements regardless of batch size: one multi-row INSERT for the emails and one for their
  // CREATED events. IDs are assigned here so events can reference rows before they exist.
  // (One INSERT per email exceeded the 5s transaction timeout at a few hundred rows.)
  const rows: Prisma.EmailCreateManyInput[] = [];
  const events: Prisma.EmailEventCreateManyInput[] = [];
  for (const { events: nested, ...row } of data) {
    const id = randomUUID();
    rows.push({ ...row, id });
    events.push({ ...(nested?.create as Omit<Prisma.EmailEventCreateManyInput, "emailId">), emailId: id });
  }
  const inserted = await prisma.$transaction(async (tx) => {
    const emails = await tx.email.createManyAndReturn({ data: rows });
    await tx.emailEvent.createMany({ data: events });
    return emails;
  });
  // RETURNING order is not guaranteed; restore input order.
  const byId = new Map(inserted.map((e) => [e.id, e]));
  const created = rows.map((r) => byId.get(r.id!)!);
  return { created, existing };
}

export async function listEmails(projectId: string, query: ListEmailsQuery) {
  const where: Prisma.EmailWhereInput = {
    projectId,
    ...(query.status && { status: query.status }),
    ...(query.source && { source: query.source }),
    ...(query.tag && { tags: { has: query.tag } }),
    ...(query.q && {
      OR: [{ subject: { contains: query.q, mode: "insensitive" } }, { to: { has: query.q.toLowerCase() } }],
    }),
  };
  const rows = await prisma.email.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    include: { provider: { select: { name: true, type: true } } },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function getEmail(projectId: string, id: string) {
  const email = await prisma.email.findFirst({
    where: { id, projectId },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      provider: { select: { id: true, name: true, type: true } },
    },
  });
  if (!email) throw new MailclockError("not_found", "Email not found");
  return email;
}

/**
 * Moves an email between states only if it is currently in one of `from`.
 * The conditional UPDATE makes this safe against the dispatcher racing us.
 */
async function transition(
  ctx: ActorContext,
  id: string,
  from: EmailStatus[],
  data: Prisma.EmailUncheckedUpdateManyInput,
  event: { type: Prisma.EmailEventCreateManyInput["type"]; data?: Prisma.InputJsonValue },
) {
  const count = await prisma.$transaction(async (tx) => {
    const res = await tx.email.updateMany({ where: { id, projectId: ctx.projectId, status: { in: from } }, data });
    if (res.count === 1) {
      await tx.emailEvent.create({ data: { emailId: id, type: event.type, actor: ctx.actor, data: event.data } });
    }
    return res.count;
  });
  if (count === 1) return getEmail(ctx.projectId, id);
  const current = await prisma.email.findFirst({ where: { id, projectId: ctx.projectId }, select: { status: true } });
  if (!current) throw new MailclockError("not_found", "Email not found");
  throw new MailclockError("invalid_state", `Email is ${current.status}; this action needs one of: ${from.join(", ")}`);
}

export function rescheduleEmail(ctx: ActorContext, id: string, sendAt: Date) {
  const at = normaliseSendAt(sendAt);
  return transition(ctx, id, PENDING, { sendAt: at, nextAttemptAt: at }, {
    type: "RESCHEDULED",
    data: { sendAt: at.toISOString() },
  });
}

export function cancelEmail(ctx: ActorContext, id: string) {
  return transition(ctx, id, PENDING, { status: "CANCELLED" }, { type: "CANCELLED" });
}

export function retryEmail(ctx: ActorContext, id: string) {
  return transition(ctx, id, ["FAILED"], { status: "SCHEDULED", attempts: 0, nextAttemptAt: new Date() }, {
    type: "RETRY_REQUESTED",
  });
}

export async function getStats(projectId: string) {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const dayAhead = new Date(Date.now() + 86_400_000);
  const [byStatus, sent24h, failed24h, upcoming24h] = await Promise.all([
    prisma.email.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    prisma.email.count({ where: { projectId, status: "SENT", sentAt: { gte: dayAgo } } }),
    prisma.email.count({ where: { projectId, status: "FAILED", updatedAt: { gte: dayAgo } } }),
    prisma.email.count({ where: { projectId, status: { in: PENDING }, nextAttemptAt: { lte: dayAhead } } }),
  ]);
  const counts: Record<EmailStatus, number> = { SCHEDULED: 0, SENDING: 0, RETRYING: 0, SENT: 0, FAILED: 0, CANCELLED: 0 };
  for (const row of byStatus) counts[row.status] = row._count._all;
  return { counts, last24h: { sent: sent24h, failed: failed24h }, next24h: { scheduled: upcoming24h } };
}

type EmailWithEvents = Email & {
  events?: { type: string; actor: string | null; data: unknown; createdAt: Date }[];
  provider?: { name: string; type: string } | null;
};

/** Public JSON shape for an email — internal lease fields are never exposed. */
export function serializeEmail(email: EmailWithEvents) {
  const { lockedAt: _l, lockedBy: _b, projectId: _p, events, ...rest } = email;
  return {
    ...rest,
    ...(events && { events: events.map((e) => ({ type: e.type, actor: e.actor, data: e.data, at: e.createdAt })) }),
  };
}
