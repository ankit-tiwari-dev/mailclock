import { retryEmail, serializeEmail } from "@mailclock/core";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";

export const POST = apiRoute<RouteContext<"/api/v1/emails/[id]/retry">>("emails:write", async (_req, actor, { params }) => {
  const { id } = await params;
  return NextResponse.json({ data: serializeEmail(await retryEmail(actor, id)) });
});
