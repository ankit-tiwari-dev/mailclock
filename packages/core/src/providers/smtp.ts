import nodemailer from "nodemailer";
import { z } from "zod";
import type { EmailTransport } from "./types";
import { ProviderError } from "./types";

export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.coerce.boolean().default(false),
  user: z.string().optional(),
  pass: z.string().optional(),
});
export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

function toProviderError(err: unknown): ProviderError {
  const e = err as { responseCode?: number; code?: string; message?: string };
  // 5xx SMTP replies and auth failures will not succeed on retry.
  const permanent = (e.responseCode !== undefined && e.responseCode >= 500) || e.code === "EAUTH" || e.code === "EENVELOPE";
  return new ProviderError(e.message ?? "SMTP error", permanent);
}

export function smtpTransport(config: SmtpConfig): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    pool: true,
    maxConnections: 5,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return {
    async verify() {
      try {
        await transporter.verify();
      } catch (err) {
        throw toProviderError(err);
      }
    },
    async send(email) {
      try {
        const info = await transporter.sendMail({
          from: email.from,
          to: email.to,
          cc: email.cc,
          bcc: email.bcc,
          replyTo: email.replyTo ?? undefined,
          subject: email.subject,
          html: email.html ?? undefined,
          text: email.text ?? undefined,
          messageId: `<${email.idempotencyKey}@mailclock>`,
        });
        return { messageId: info.messageId };
      } catch (err) {
        throw toProviderError(err);
      }
    },
    close: () => transporter.close(),
  };
}
