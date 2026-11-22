import { z } from "zod";

const MAX_RECIPIENTS = 50;

/** Accepts "a@b.com" or "Name <a@b.com>". */
const fromAddress = z
  .string()
  .trim()
  .max(320)
  .refine(
    (v) => z.email().safeParse(v.match(/<([^>]+)>\s*$/)?.[1] ?? v).success,
    'Must be an email address or "Name <email>"',
  );

const recipients = z
  .union([z.email(), z.array(z.email()).max(MAX_RECIPIENTS)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

const sendAt = z
  .union([z.iso.datetime({ offset: true }), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

export const createEmailSchema = z
  .object({
    from: fromAddress.optional(),
    to: recipients.refine((v) => v.length > 0, "At least one recipient is required"),
    cc: recipients.optional(),
    bcc: recipients.optional(),
    replyTo: z.email().optional(),
    subject: z.string().trim().min(1).max(998),
    html: z.string().max(2_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    sendAt: sendAt.optional().describe("ISO 8601 with offset. Omit to send as soon as possible."),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    providerId: z.uuid().optional(),
    idempotencyKey: z.string().min(1).max(256).optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
  })
  .refine((v) => v.html || v.text, { message: "Provide html or text", path: ["html"] });

export type CreateEmailInput = z.input<typeof createEmailSchema>;
export type CreateEmail = z.output<typeof createEmailSchema>;

export const createBatchSchema = z.object({
  emails: z.array(createEmailSchema).min(1).max(1000),
  /** Spaces sends out: email i goes at sendAt + i × staggerSeconds. */
  staggerSeconds: z.number().min(0).max(86_400).optional(),
});
export type CreateBatch = z.output<typeof createBatchSchema>;

export const rescheduleSchema = z.object({ sendAt });

export const EMAIL_STATUSES = ["SCHEDULED", "SENDING", "RETRYING", "SENT", "FAILED", "CANCELLED"] as const;

export const listEmailsSchema = z.object({
  status: z.enum(EMAIL_STATUSES).optional(),
  tag: z.string().optional(),
  source: z.enum(["DASHBOARD", "API", "MCP", "CLI"]).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
export type ListEmailsQuery = z.output<typeof listEmailsSchema>;
