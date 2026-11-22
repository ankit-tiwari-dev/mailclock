import { createEmailSchema, listEmails, listEmailsSchema, scheduleEmail, serializeEmail } from "@mailclock/core";
import { NextResponse } from "next/server";
import { apiRoute, readJsonWithIdempotencyKey } from "@/lib/api";

/** List emails. Query: status, tag, source, q, limit (≤100), cursor. */
export const GET = apiRoute("emails:read", async (req, actor) => {
  const query = listEmailsSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { items, nextCursor } = await listEmails(actor.projectId, query);
  return NextResponse.json({ data: items.map(serializeEmail), nextCursor });
});

/** Schedule one email. An `Idempotency-Key` header (or body field) makes retries safe. */
export const POST = apiRoute("emails:write", async (req, actor) => {
  const body = createEmailSchema.parse(await readJsonWithIdempotencyKey(req));
  const { email, created } = await scheduleEmail(actor, body);
  return NextResponse.json({ data: serializeEmail(email), created }, { status: created ? 201 : 200 });
});
