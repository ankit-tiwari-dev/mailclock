import { prisma } from "@mailclock/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  backoffMs,
  cancelEmail,
  createApiKey,
  createEmailSchema,
  createProvider,
  dispatchDue,
  getEmail,
  leasedBy,
  moveEmail,
  parseWorkerEnv,
  readEvents,
  rescheduleEmail,
  retryEmail,
  scheduleBatch,
  scheduleEmail,
  verifyApiKey,
  type ActorContext,
} from "../src";

let ctx: ActorContext;

const input = (overrides: Record<string, unknown> = {}) =>
  createEmailSchema.parse({ to: "ada@example.com", subject: "Hello", text: "Hi there", ...overrides });

const dispatch = (workerId = "test") => dispatchDue({ workerId, timeBudgetMs: 10_000 });

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "user", project CASCADE');
  const user = await prisma.user.create({ data: { id: "u1", name: "Test", email: "t@example.com" } });
  const project = await prisma.project.create({ data: { name: "Test", ownerId: user.id } });
  await createProvider(project.id, { name: "Mock", type: "MOCK", config: {}, defaultFrom: "Test <t@example.com>" });
  ctx = { projectId: project.id, actor: `user:${user.id}`, source: "API" };
});

afterAll(() => prisma.$disconnect());

describe("scheduling", () => {
  it("sends a due email and records the timeline", async () => {
    const { email } = await scheduleEmail(ctx, input());
    expect(email.status).toBe("SCHEDULED");

    const r = await dispatch();
    expect(r).toMatchObject({ claimed: 1, sent: 1 });

    const after = await getEmail(ctx.projectId, email.id);
    expect(after.status).toBe("SENT");
    expect(after.providerMessageId).toMatch(/^mock_/);
    expect(after.lockedBy).toBeNull();
    expect(after.events.map((e) => e.type)).toEqual(["CREATED", "SENT"]);
  });

  it("does not send emails scheduled in the future", async () => {
    await scheduleEmail(ctx, input({ sendAt: new Date(Date.now() + 3_600_000).toISOString() }));
    expect((await dispatch()).claimed).toBe(0);
  });

  it("rejects sendAt in the past", async () => {
    await expect(scheduleEmail(ctx, input({ sendAt: "2020-01-01T00:00:00Z" }))).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("is idempotent on idempotencyKey", async () => {
    const a = await scheduleEmail(ctx, input({ idempotencyKey: "order-42" }));
    const b = await scheduleEmail(ctx, input({ idempotencyKey: "order-42", subject: "Different" }));
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.email.id).toBe(a.email.id);
  });

  it("schedules the maximum batch of 1,000 in one transaction, each with a CREATED event", async () => {
    const emails = Array.from({ length: 1000 }, (_, i) => input({ to: `bulk${i}@example.com` }));
    const { created } = await scheduleBatch(ctx, { emails, staggerSeconds: 1 });
    expect(created).toHaveLength(1000);
    // Order and stagger follow the input order.
    expect(created[0]!.to).toEqual(["bulk0@example.com"]);
    expect(created[999]!.sendAt.getTime() - created[0]!.sendAt.getTime()).toBe(999_000);
    expect(await prisma.emailEvent.count({ where: { type: "CREATED" } })).toBe(1000);
  });

  it("rejects an empty or blank idempotency key instead of storing it (sharp edges, 2026-11-22)", () => {
    // An empty Idempotency-Key header used to be stored as "" and fail every later request with a 500.
    for (const key of ["", "   "]) {
      expect(createEmailSchema.safeParse({ to: "a@example.com", subject: "s", text: "t", idempotencyKey: key }).success).toBe(false);
    }
    expect(createEmailSchema.parse({ to: "a@example.com", subject: "s", text: "t", idempotencyKey: " order-1 " }).idempotencyKey).toBe("order-1");
  });

  it("staggers a batch", async () => {
    const { created } = await scheduleBatch(ctx, {
      emails: [input(), input({ to: "b@example.com" }), input({ to: "c@example.com" })],
      staggerSeconds: 60,
    });
    const times = created.map((e) => e.sendAt.getTime());
    expect(times[1]! - times[0]!).toBe(60_000);
    expect(times[2]! - times[0]!).toBe(120_000);
  });
});

describe("failures", () => {
  it("fails permanently without retrying", async () => {
    const { email } = await scheduleEmail(ctx, input({ to: "bounce@example.com" }));
    expect((await dispatch()).failed).toBe(1);
    const after = await getEmail(ctx.projectId, email.id);
    expect(after.status).toBe("FAILED");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toContain("550");
  });

  it("retries transient errors with backoff, then fails after maxAttempts", async () => {
    const { email } = await scheduleEmail(ctx, input({ to: "flaky@example.com", maxAttempts: 2 }));
    expect((await dispatch()).retrying).toBe(1);
    let after = await getEmail(ctx.projectId, email.id);
    expect(after.status).toBe("RETRYING");
    expect(after.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Fast-forward the backoff.
    await prisma.email.update({ where: { id: email.id }, data: { nextAttemptAt: new Date() } });
    expect((await dispatch()).failed).toBe(1);
    after = await getEmail(ctx.projectId, email.id);
    expect(after.status).toBe("FAILED");
    expect(after.attempts).toBe(2);
  });

  it("a failed email can be retried manually", async () => {
    const { email } = await scheduleEmail(ctx, input({ to: "bounce@example.com" }));
    await dispatch();
    const retried = await retryEmail(ctx, email.id);
    expect(retried.status).toBe("SCHEDULED");
    expect(retried.attempts).toBe(0);
  });

  it("reclaims an email whose lease expired (crashed worker)", async () => {
    const { email } = await scheduleEmail(ctx, input());
    await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENDING", lockedBy: "dead-worker", lockedAt: new Date(Date.now() - 10 * 60_000), attempts: 1 },
    });
    expect((await dispatch()).sent).toBe(1);
    expect((await getEmail(ctx.projectId, email.id)).attempts).toBe(2);
  });
});

describe("lifecycle moves", () => {
  // Regression: the dispatcher used to write SENT/ATTEMPT_FAILED/FAILED events even when its lease
  // had been reclaimed and the guarded row update matched nothing.
  it("a runner whose lease was reclaimed changes nothing and records no event", async () => {
    const { email } = await scheduleEmail(ctx, input());
    await prisma.email.update({ where: { id: email.id }, data: { status: "SENDING", lockedBy: "new-owner", lockedAt: new Date() } });

    const moved = await moveEmail(leasedBy(email.id, "old-owner"), { status: "SENT", sentAt: new Date() }, [
      { type: "SENT", data: { attempt: 1, messageId: "m", provider: "Mock" } },
    ]);

    expect(moved).toBe(false);
    const after = await getEmail(ctx.projectId, email.id);
    expect(after.status).toBe("SENDING");
    expect(after.events.map((e) => e.type)).toEqual(["CREATED"]);
  });

  it("records FAILED as permanent only when the provider rejected the email outright", async () => {
    const { email: bounced } = await scheduleEmail(ctx, input({ to: "bounce@example.com" }));
    const { email: flaky } = await scheduleEmail(ctx, input({ to: "flaky@example.com", maxAttempts: 1 }));
    await dispatch();
    const failedData = async (id: string) =>
      readEvents((await getEmail(ctx.projectId, id)).events).find((e) => e.type === "FAILED")?.data;
    expect(await failedData(bounced.id)).toMatchObject({ permanent: true });
    expect(await failedData(flaky.id)).toMatchObject({ permanent: false });
  });
});

describe("state transitions", () => {
  it("cancels and reschedules only pending emails", async () => {
    const { email } = await scheduleEmail(ctx, input({ sendAt: new Date(Date.now() + 3_600_000).toISOString() }));
    const later = new Date(Date.now() + 7_200_000);
    expect((await rescheduleEmail(ctx, email.id, later)).nextAttemptAt.getTime()).toBe(later.getTime());
    expect((await cancelEmail(ctx, email.id)).status).toBe("CANCELLED");
    await expect(cancelEmail(ctx, email.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("cannot touch another project's email", async () => {
    const { email } = await scheduleEmail(ctx, input());
    await expect(cancelEmail({ ...ctx, projectId: "00000000-0000-0000-0000-000000000000" }, email.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("concurrency & limits", () => {
  it("never double-sends when several dispatchers race", async () => {
    await scheduleBatch(ctx, { emails: Array.from({ length: 40 }, (_, i) => input({ to: `u${i}@example.com` })) });
    const results = await Promise.all(["w1", "w2", "w3", "w4"].map((w) => dispatch(w)));
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(40);
    const sentEvents = await prisma.emailEvent.count({ where: { type: "SENT" } });
    expect(sentEvents).toBe(40);
  });

  it("defers emails beyond a provider's hourly rate", async () => {
    await prisma.provider.updateMany({ where: { projectId: ctx.projectId }, data: { ratePerHour: 2 } });
    await scheduleBatch(ctx, { emails: [input(), input(), input()] });
    const r = await dispatch();
    expect(r).toMatchObject({ sent: 2, rateLimited: 1 });
    const deferred = await prisma.email.findFirstOrThrow({ where: { status: "SCHEDULED" } });
    expect(deferred.attempts).toBe(0);
    expect(deferred.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it("enforces an API key's daily quota", async () => {
    const { key, record } = await createApiKey({ projectId: ctx.projectId, name: "agent", dailyQuota: 1 });
    const auth = await verifyApiKey(key);
    const keyCtx: ActorContext = { ...ctx, actor: `key:${record.id}`, apiKey: { id: auth.id, dailyQuota: auth.dailyQuota } };
    await scheduleEmail(keyCtx, input());
    await expect(scheduleEmail(keyCtx, input())).rejects.toMatchObject({ code: "quota_exceeded" });
  });
});

describe("dispatch settings (sharp edges, 2026-11-22)", () => {
  it("refuses settings that silently break delivery instead of running with them", async () => {
    // lease 0 re-sent an in-flight email; concurrency NaN/0 claimed emails and never sent them.
    for (const bad of [{ leaseSeconds: 0 }, { concurrency: Number.NaN }, { concurrency: 0 }, { batchSize: 0 }]) {
      await expect(dispatchDue({ workerId: "w", ...bad })).rejects.toThrow();
    }
    expect(await prisma.email.count({ where: { status: "SENDING" } })).toBe(0);
  });

  it("treats a blank worker variable as unset, and rejects nonsense with the variable's name", () => {
    expect(parseWorkerEnv({ WORKER_LEASE_SECONDS: "", WORKER_CONCURRENCY: "  " })).toMatchObject({ WORKER_LEASE_SECONDS: 120, WORKER_CONCURRENCY: 5 });
    expect(() => parseWorkerEnv({ WORKER_CONCURRENCY: "abc" })).toThrow(/WORKER_CONCURRENCY/);
    expect(() => parseWorkerEnv({ WORKER_LEASE_SECONDS: "0" })).toThrow(/WORKER_LEASE_SECONDS/);
  });
});

describe("backoff", () => {
  it("doubles and caps", () => {
    const mid = () => 0.5;
    expect(backoffMs(1, mid)).toBe(30_000);
    expect(backoffMs(2, mid)).toBe(60_000);
    expect(backoffMs(20, mid)).toBe(3_600_000);
  });
});
