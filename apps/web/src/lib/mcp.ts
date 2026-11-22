import "server-only";
import {
  EMAIL_STATUSES,
  MailclockError,
  cancelEmail,
  createBatchSchema,
  createEmailSchema,
  getEmail,
  getStats,
  listEmails,
  listEmailsSchema,
  rescheduleEmail,
  retryEmail,
  scheduleBatch,
  scheduleEmail,
  type ActorContext,
  type AuthenticatedKey,
} from "@mailclock/core";
import type { Email } from "@mailclock/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const sendAtDescription =
  "When to send, as ISO 8601 with a UTC offset, e.g. 2026-12-01T09:00:00+05:30. Omit to send now. " +
  "Convert the user's local time yourself; the current server time is in every response as `now`.";

/** Compact, agent-friendly view of an email, with a link a human can open. */
function summarize(email: Email, origin: string) {
  return {
    id: email.id,
    status: email.status,
    to: email.to,
    subject: email.subject,
    sendAt: email.sendAt,
    nextAttemptAt: email.status === "SCHEDULED" || email.status === "RETRYING" ? email.nextAttemptAt : undefined,
    sentAt: email.sentAt ?? undefined,
    attempts: email.attempts,
    lastError: email.lastError ?? undefined,
    tags: email.tags.length ? email.tags : undefined,
    dashboardUrl: `${origin}/dashboard/emails/${email.id}`,
  };
}

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ now: new Date().toISOString(), ...(data as object) }, null, 2) }],
});

/** Turns domain errors into tool errors the agent can read and recover from. */
async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    const message =
      err instanceof MailclockError
        ? `${err.code}: ${err.message}`
        : err instanceof z.ZodError
          ? `validation_error: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
          : "internal_error: something went wrong on the Mailclock server";
    if (!(err instanceof MailclockError) && !(err instanceof z.ZodError)) console.error("[mcp]", err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const emailFields = {
  to: z.union([z.string(), z.array(z.string())]).describe("Recipient address, or a list of up to 50 (all receive the same email)"),
  subject: z.string().describe("Subject line"),
  text: z.string().optional().describe("Plain-text body. Provide text, html, or both."),
  html: z.string().optional().describe("HTML body"),
  from: z.string().optional().describe('Sender, e.g. "Acme <hello@acme.com>". Omit to use the project default.'),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  tags: z.array(z.string()).optional().describe("Labels for filtering later, e.g. ['billing']"),
};

/**
 * Builds an MCP server bound to one API key. Keys without the
 * `emails:write` scope only see read tools.
 */
export function createMcpServer(key: AuthenticatedKey, origin: string) {
  const server = new McpServer(
    { name: "mailclock", version: "0.1.0" },
    {
      instructions:
        "Mailclock schedules emails and reports what happened to them. Use schedule_email to send now or later, " +
        "list_emails / get_email to check on them, and reschedule_email / cancel_email before they go out. " +
        "Always confirm the recipient, subject, and send time with the user before scheduling or cancelling. " +
        "Share the dashboardUrl so the user can see the email's full history.",
    },
  );
  const actor: ActorContext = {
    projectId: key.projectId,
    actor: `key:${key.id}`,
    source: "MCP",
    apiKey: { id: key.id, dailyQuota: key.dailyQuota },
  };
  const canWrite = key.scopes.includes("emails:write");

  // ─── Read tools ────────────────────────────────────────────────────────────

  server.registerTool(
    "list_emails",
    {
      title: "List emails",
      description: "List emails in this Mailclock project, newest first. Filter by status, tag, or a search term.",
      inputSchema: {
        status: z.enum(EMAIL_STATUSES).optional(),
        tag: z.string().optional(),
        q: z.string().optional().describe("Matches subject text or an exact recipient address"),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
        cursor: z.string().optional().describe("nextCursor from a previous call"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guard(async () => {
        const query = listEmailsSchema.parse({ ...args, limit: args.limit ?? 20 });
        const { items, nextCursor } = await listEmails(actor.projectId, query);
        return ok({ emails: items.map((e) => summarize(e, origin)), nextCursor });
      }),
  );

  server.registerTool(
    "get_email",
    {
      title: "Get an email",
      description: "Get one email with its full history: every attempt, provider responses, and errors.",
      inputSchema: { id: z.string().describe("Email ID") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ id }) =>
      guard(async () => {
        const email = await getEmail(actor.projectId, id);
        return ok({
          email: {
            ...summarize(email, origin),
            from: email.from,
            providerMessageId: email.providerMessageId ?? undefined,
            history: email.events.map((e) => ({ type: e.type, at: e.createdAt, ...(e.data as object) })),
          },
        });
      }),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Get delivery stats",
      description: "Counts of emails by status, plus sent and failed in the last 24 hours and scheduled for the next 24.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => guard(async () => ok(await getStats(actor.projectId))),
  );

  if (!canWrite) return server;

  // ─── Write tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "schedule_email",
    {
      title: "Schedule an email",
      description:
        "Schedule one email for a specific time, or send it now. Pass an idempotencyKey when retrying so the email is never scheduled twice.",
      inputSchema: {
        ...emailFields,
        sendAt: z.string().optional().describe(sendAtDescription),
        idempotencyKey: z.string().optional().describe("Any unique string; repeating it returns the original email"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    (args) =>
      guard(async () => {
        const input = createEmailSchema.parse(args);
        const { email, created } = await scheduleEmail(actor, input);
        return ok({ created, email: summarize(email, origin) });
      }),
  );

  server.registerTool(
    "schedule_batch",
    {
      title: "Schedule the same email to many people",
      description:
        "Send one email to many recipients, each as a separate email (one bounce does not affect the others). Optionally space them out.",
      inputSchema: {
        ...emailFields,
        to: z.array(z.string()).min(1).max(1000).describe("Up to 1,000 recipients; each gets their own email"),
        sendAt: z.string().optional().describe(sendAtDescription),
        staggerSeconds: z.number().min(0).max(86_400).optional().describe("Seconds between consecutive sends"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ to, staggerSeconds, ...rest }) =>
      guard(async () => {
        const batch = createBatchSchema.parse({ staggerSeconds, emails: to.map((recipient) => ({ ...rest, to: recipient })) });
        const { created } = await scheduleBatch(actor, batch);
        const first = created[0];
        const last = created.at(-1);
        return ok({
          scheduled: created.length,
          firstSendAt: first?.sendAt,
          lastSendAt: last?.sendAt,
          ids: created.map((e) => e.id),
          dashboardUrl: `${origin}/dashboard/emails`,
        });
      }),
  );

  server.registerTool(
    "reschedule_email",
    {
      title: "Reschedule an email",
      description: "Move a scheduled (not yet sent) email to a new time.",
      inputSchema: { id: z.string(), sendAt: z.string().describe(sendAtDescription) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ id, sendAt }) =>
      guard(async () => {
        const at = z.iso.datetime({ offset: true }).parse(sendAt);
        return ok({ email: summarize(await rescheduleEmail(actor, id, new Date(at)), origin) });
      }),
  );

  server.registerTool(
    "cancel_email",
    {
      title: "Cancel an email",
      description: "Cancel an email that has not been sent yet. This cannot be undone; confirm with the user first.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) => guard(async () => ok({ email: summarize(await cancelEmail(actor, id), origin) })),
  );

  server.registerTool(
    "retry_email",
    {
      title: "Send a failed email again",
      description: "Queue a FAILED email for another round of attempts. Fix the cause first (see lastError).",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ id }) => guard(async () => ok({ email: summarize(await retryEmail(actor, id), origin) })),
  );

  return server;
}
