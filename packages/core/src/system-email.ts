// Mailclock's own email (account verification, password reset), as opposed to users' scheduled
// email. Sent through the same hardened transports as provider email (TLS required, no private
// hosts), configured from the environment:
//
//   MAILCLOCK_SYSTEM_EMAIL = "resend" | "smtp" | "log"
//   MAILCLOCK_SYSTEM_EMAIL_FROM            e.g. "Mailclock <no-reply@yourdomain.com>"  (resend, smtp)
//   MAILCLOCK_SYSTEM_RESEND_API_KEY        (resend)
//   MAILCLOCK_SYSTEM_SMTP_HOST / _PORT / _USER / _PASS / _TLS   (smtp)
//
// "log" prints each message (with its link) to the server log as one JSON line: for local
// development and single-admin self-hosting. With nothing configured, sending fails loudly.
import { randomUUID } from "node:crypto";
import { MailclockError } from "./errors";
import { createTransport, type EmailTransport } from "./providers";

type SystemEmail = { to: string; subject: string; text: string; html?: string };

export function systemEmailMode(env: Record<string, string | undefined> = process.env): "resend" | "smtp" | "log" | null {
  const mode = env.MAILCLOCK_SYSTEM_EMAIL?.trim().toLowerCase();
  return mode === "resend" || mode === "smtp" || mode === "log" ? mode : null;
}

let transport: EmailTransport | null = null;

function systemTransport(env: Record<string, string | undefined>): { transport: EmailTransport; from: string } {
  const mode = systemEmailMode(env);
  const from = env.MAILCLOCK_SYSTEM_EMAIL_FROM?.trim();
  if (!mode || mode === "log") throw new Error("unreachable");
  if (!from) throw new MailclockError("internal_error", "MAILCLOCK_SYSTEM_EMAIL_FROM is not set");
  transport ??=
    mode === "resend"
      ? createTransport("RESEND", { apiKey: env.MAILCLOCK_SYSTEM_RESEND_API_KEY ?? "" })
      : createTransport("SMTP", {
          host: env.MAILCLOCK_SYSTEM_SMTP_HOST ?? "",
          port: Number(env.MAILCLOCK_SYSTEM_SMTP_PORT || 587),
          tls: env.MAILCLOCK_SYSTEM_SMTP_TLS || "starttls",
          user: env.MAILCLOCK_SYSTEM_SMTP_USER || undefined,
          pass: env.MAILCLOCK_SYSTEM_SMTP_PASS || undefined,
        });
  return { transport, from };
}

export async function sendSystemEmail(email: SystemEmail, env: Record<string, string | undefined> = process.env): Promise<void> {
  const mode = systemEmailMode(env);
  if (!mode) {
    throw new MailclockError(
      "internal_error",
      'Mailclock cannot send account emails: set MAILCLOCK_SYSTEM_EMAIL to "resend", "smtp", or "log" (see .env.example).',
    );
  }
  if (mode === "log") {
    console.log(JSON.stringify({ type: "system-email", to: email.to, subject: email.subject, text: email.text }));
    return;
  }
  const { transport: t, from } = systemTransport(env);
  await t.send({ from, to: [email.to], cc: [], bcc: [], subject: email.subject, text: email.text, html: email.html, idempotencyKey: randomUUID() });
}
