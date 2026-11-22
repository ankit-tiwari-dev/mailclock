import { createBatchSchema, scheduleBatch, serializeEmail } from "@mailclock/core";
import { NextResponse } from "next/server";
import { apiRoute, parseJson } from "@/lib/api";

/** Schedule up to 1,000 emails in one transaction, optionally staggered. */
export const POST = apiRoute("emails:write", async (req, actor) => {
  const body = await parseJson(req, createBatchSchema);
  const { created, existing } = await scheduleBatch(actor, body);
  return NextResponse.json(
    { data: created.map((e) => serializeEmail(e)), duplicates: existing.map((e) => e.id) },
    { status: 201 },
  );
});
