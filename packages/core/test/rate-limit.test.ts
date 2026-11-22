import { prisma } from "@mailclock/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MailclockError, apiRateLimitPerMinute, consumeApiRateLimit, sendSystemEmail, systemEmailMode } from "../src";

beforeEach(() => prisma.$executeRawUnsafe("TRUNCATE api_rate_limit"));
afterAll(() => prisma.$disconnect());

describe("API key rate limit (Postgres-backed)", () => {
  it("allows up to the limit, then refuses with how long to wait", async () => {
    for (let i = 0; i < 3; i++) await consumeApiRateLimit("key:a", 3);
    const err = await consumeApiRateLimit("key:a", 3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailclockError);
    expect(err).toMatchObject({ code: "rate_limited", status: 429 });
    expect((err as MailclockError).details).toMatchObject({ retryAfter: expect.any(Number) });
    expect(((err as MailclockError).details as { retryAfter: number }).retryAfter).toBeLessThanOrEqual(60);
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < 3; i++) await consumeApiRateLimit("key:a", 3);
    await expect(consumeApiRateLimit("key:b", 3)).resolves.toBeUndefined();
  });

  it("holds under concurrency: exactly the limit gets through", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeApiRateLimit("key:c", 5)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });

  it("starts a fresh window once the minute has passed", async () => {
    for (let i = 0; i < 3; i++) await consumeApiRateLimit("key:d", 3);
    await prisma.$executeRawUnsafe(`UPDATE api_rate_limit SET "windowStart" = now() - interval '61 seconds' WHERE key = 'key:d'`);
    await expect(consumeApiRateLimit("key:d", 3)).resolves.toBeUndefined();
  });

  it("validates the configured limit", () => {
    expect(apiRateLimitPerMinute({})).toBe(120);
    expect(apiRateLimitPerMinute({ MAILCLOCK_API_RATE_LIMIT_PER_MINUTE: " " })).toBe(120);
    expect(apiRateLimitPerMinute({ MAILCLOCK_API_RATE_LIMIT_PER_MINUTE: "30" })).toBe(30);
    for (const bad of ["0", "-5", "abc", "1.5"]) expect(() => apiRateLimitPerMinute({ MAILCLOCK_API_RATE_LIMIT_PER_MINUTE: bad })).toThrow();
  });
});

describe("system email", () => {
  it("fails loudly when not configured, instead of silently not sending", async () => {
    expect(systemEmailMode({})).toBeNull();
    await expect(sendSystemEmail({ to: "a@example.com", subject: "s", text: "t" }, {})).rejects.toThrow(/MAILCLOCK_SYSTEM_EMAIL/);
  });

  it("log mode prints the message for local development", async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => lines.push(l);
    try {
      await sendSystemEmail({ to: "a@example.com", subject: "Verify", text: "https://x/verify?token=1" }, { MAILCLOCK_SYSTEM_EMAIL: "log" });
    } finally {
      console.log = orig;
    }
    expect(JSON.parse(lines[0]!)).toMatchObject({ type: "system-email", to: "a@example.com", text: "https://x/verify?token=1" });
  });

  it("refuses a sender without a From address", async () => {
    await expect(
      sendSystemEmail({ to: "a@example.com", subject: "s", text: "t" }, { MAILCLOCK_SYSTEM_EMAIL: "resend", MAILCLOCK_SYSTEM_RESEND_API_KEY: "re_x" }),
    ).rejects.toThrow(/MAILCLOCK_SYSTEM_EMAIL_FROM/);
  });
});
