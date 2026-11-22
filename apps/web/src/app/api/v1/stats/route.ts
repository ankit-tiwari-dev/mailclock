import { getStats } from "@mailclock/core";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute("emails:read", async (_req, actor) => NextResponse.json({ data: await getStats(actor.projectId) }));
