// Per-API-key request limit for the REST API and the MCP endpoint, stored in Postgres so the limit
// holds across every server instance (an in-memory counter on serverless is per instance, so
// effectively unlimited).
import { prisma } from "@mailclock/db";
import { z } from "zod";
import { MailclockError } from "./errors";

const WINDOW_SECONDS = 60;

/** Requests per minute per key. MAILCLOCK_API_RATE_LIMIT_PER_MINUTE; blank means the default. */
export function apiRateLimitPerMinute(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAILCLOCK_API_RATE_LIMIT_PER_MINUTE?.trim();
  if (!raw) return 120;
  const parsed = z.coerce.number().int().min(1).max(100_000).safeParse(raw);
  if (!parsed.success) throw new Error("MAILCLOCK_API_RATE_LIMIT_PER_MINUTE must be a whole number from 1 to 100000");
  return parsed.data;
}

/**
 * Counts one request for `key` in the current fixed window and throws `rate_limited` (HTTP 429,
 * with the seconds to wait in details.retryAfter) once the limit is passed. One atomic statement:
 * concurrent requests cannot both slip under the limit.
 */
export async function consumeApiRateLimit(key: string, limit = apiRateLimitPerMinute()): Promise<void> {
  const [row] = await prisma.$queryRaw<{ count: number; retry_after: number }[]>`
    INSERT INTO api_rate_limit (key, "windowStart", count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN api_rate_limit."windowStart" <= now() - (${WINDOW_SECONDS}::int * interval '1 second') THEN 1 ELSE api_rate_limit.count + 1 END,
      "windowStart" = CASE WHEN api_rate_limit."windowStart" <= now() - (${WINDOW_SECONDS}::int * interval '1 second') THEN now() ELSE api_rate_limit."windowStart" END
    RETURNING count, ceil(extract(epoch FROM ("windowStart" + (${WINDOW_SECONDS}::int * interval '1 second') - now())))::int AS retry_after`;
  if (row && row.count > limit) {
    const retryAfter = Math.max(1, row.retry_after);
    throw new MailclockError("rate_limited", `Too many requests for this API key (limit ${limit} per minute). Retry in ${retryAfter}s.`, { retryAfter });
  }
}
