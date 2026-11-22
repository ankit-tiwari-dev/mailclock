import { randomUUID } from "node:crypto";
import { dispatchDue, safeEqual } from "@mailclock/core";
import { NextResponse, type NextRequest } from "next/server";

// Give the dispatcher most of the function's lifetime.
export const maxDuration = 60;

/**
 * Sends due emails. Called every minute by Vercel Cron (see vercel.json), so the
 * hosted version needs no separate worker. Safe to run alongside apps/worker.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // A short secret is treated as unset (fail closed): it can be guessed, and this route sends email.
  if (secret && secret.length < 32) console.error("[cron] CRON_SECRET is shorter than 32 characters; refusing all cron requests");
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 32 || !safeEqual(given, secret)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Invalid cron secret" } }, { status: 401 });
  }
  // Unique per invocation: overlapping cron runs must not be able to finish each other's leases.
  const result = await dispatchDue({ workerId: `cron-${randomUUID()}`, timeBudgetMs: 45_000 });
  return NextResponse.json({ data: result });
}
