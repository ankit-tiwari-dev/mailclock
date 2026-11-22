import { systemEmailMode } from "@mailclock/core";
import { prisma } from "@mailclock/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Without a system email sender nobody can confirm a new account, so a deploy missing it
    // reports degraded instead of looking healthy.
    if (!systemEmailMode()) {
      return NextResponse.json({ status: "degraded", systemEmail: "not configured (set MAILCLOCK_SYSTEM_EMAIL)" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
