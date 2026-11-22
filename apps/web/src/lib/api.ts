import "server-only";
import { MailclockError, requireScope, verifyApiKey, type ActorContext, type ApiKeyScope, type AuthenticatedKey } from "@mailclock/core";
import type { EmailSource } from "@mailclock/db";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export function errorResponse(err: unknown) {
  if (err instanceof MailclockError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
}

/** Clients may label themselves (the CLI and MCP server do); anything else counts as API. */
function sourceFrom(req: NextRequest): EmailSource {
  const s = req.headers.get("x-mailclock-source")?.toUpperCase();
  return s === "CLI" || s === "MCP" ? s : "API";
}

/**
 * The one way a request authenticates with an API key: reads the bearer token, verifies it, and
 * (when given) checks a scope. REST routes get it via apiRoute(); the MCP endpoint calls it directly.
 * scripts/ownership-check.mjs rejects new verifyApiKey() calls anywhere else in apps/.
 */
export async function authenticateApiKey(req: Request, scope?: ApiKeyScope): Promise<AuthenticatedKey> {
  const header = req.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const key = await verifyApiKey(token);
  if (scope) requireScope(key, scope);
  return key;
}

/**
 * Wraps a public API route: authenticates the bearer API key, checks its
 * scope, and converts thrown errors into JSON error responses.
 */
export function apiRoute<Ctx>(
  scope: ApiKeyScope,
  handler: (req: NextRequest, actor: ActorContext, ctx: Ctx) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const key = await authenticateApiKey(req, scope);
      const actor: ActorContext = {
        projectId: key.projectId,
        actor: `key:${key.id}`,
        source: sourceFrom(req),
        apiKey: { id: key.id, dailyQuota: key.dailyQuota },
      };
      return await handler(req, actor, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new MailclockError("validation_error", "Request body must be valid JSON");
  }
  return schema.parse(body);
}
