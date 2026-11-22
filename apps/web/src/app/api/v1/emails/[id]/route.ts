import { getEmail, rescheduleEmail, rescheduleSchema, serializeEmail } from "@mailclock/core";
import { NextResponse } from "next/server";
import { apiRoute, parseJson } from "@/lib/api";

type Ctx = RouteContext<"/api/v1/emails/[id]">;

/** One email with its full event timeline. */
export const GET = apiRoute<Ctx>("emails:read", async (_req, actor, { params }) => {
  const { id } = await params;
  return NextResponse.json({ data: serializeEmail(await getEmail(actor.projectId, id)) });
});

/** Reschedule a pending email: { "sendAt": "2026-12-01T09:00:00+05:30" } */
export const PATCH = apiRoute<Ctx>("emails:write", async (req, actor, { params }) => {
  const { id } = await params;
  const { sendAt } = await parseJson(req, rescheduleSchema);
  return NextResponse.json({ data: serializeEmail(await rescheduleEmail(actor, id, sendAt)) });
});
