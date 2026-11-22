import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import { resolveDeliverableHost } from "./network";
import type { EmailTransport } from "./types";
import { ProviderError } from "./types";

/**
 * How the connection is encrypted. There is no "maybe": `starttls` (the default) refuses to
 * continue unless the server upgrades to TLS, so stripping STARTTLS from the greeting cannot make
 * Mailclock send credentials in the clear. `none` is for local relays only.
 */
export const SMTP_TLS_MODES = ["starttls", "implicit", "none"] as const;
export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

const isLocalRelay = (host: string) => /^(localhost|127(\.\d+){3}|::1|\[::1\])$/i.test(host) || !host.includes(".");

export const smtpConfigSchema = z
  .preprocess(
    // Configs saved before TLS modes existed stored `secure: boolean`.
    (raw) => {
      if (raw && typeof raw === "object" && "secure" in raw && !("tls" in raw)) {
        const { secure, ...rest } = raw as Record<string, unknown>;
        return { ...rest, tls: secure === true ? "implicit" : "starttls" };
      }
      return raw;
    },
    z.object({
      host: z.string().trim().min(1),
      port: z.number().int().min(1).max(65535).default(587),
      tls: z.enum(SMTP_TLS_MODES).default("starttls"),
      user: z.string().optional(),
      pass: z.string().optional(),
    }),
  )
  .refine((c) => c.tls !== "none" || isLocalRelay(c.host), {
    message: 'TLS can only be turned off for a local relay (localhost or a container name). Use "starttls" or "implicit".',
    path: ["tls"],
  });
export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

function toProviderError(err: unknown): ProviderError {
  const e = err as { responseCode?: number; code?: string; message?: string };
  if (err instanceof ProviderError) return err;
  // 5xx SMTP replies and auth failures will not succeed on retry.
  const permanent = (e.responseCode !== undefined && e.responseCode >= 500) || e.code === "EAUTH" || e.code === "EENVELOPE";
  return new ProviderError(e.message ?? "SMTP error", permanent);
}

/**
 * Connection-test errors name the kind of failure, never the remote server's reply: echoing
 * banners and socket errors back to whoever typed the host turns the test into a network probe.
 */
function describeVerifyError(err: unknown, config: SmtpConfig): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { code?: string; message?: string };
  const where = `${config.host}:${config.port}`;
  if (e.code === "EAUTH") return new ProviderError("The SMTP server rejected the username or password", true);
  if (e.code === "ETLS" || /certificate|STARTTLS|TLS/i.test(e.message ?? "")) {
    return new ProviderError(`Could not set up TLS with ${where}. Check the TLS mode and that the certificate matches the host name.`, true);
  }
  return new ProviderError(`Could not reach an SMTP server at ${where}`, false);
}

export function smtpTransport(config: SmtpConfig): EmailTransport {
  let transporter: Transporter | undefined;

  // Built on first use: the host is resolved and checked, then the connection is pinned to that
  // address (TLS still verifies the certificate against the original host name).
  const connect = async () => {
    if (transporter) return transporter;
    let address: string;
    try {
      address = await resolveDeliverableHost(config.host);
    } catch (err) {
      throw new ProviderError(err instanceof Error ? err.message : String(err), true);
    }
    transporter = nodemailer.createTransport({
      host: address,
      port: config.port,
      secure: config.tls === "implicit",
      requireTLS: config.tls === "starttls",
      ignoreTLS: config.tls === "none",
      tls: { servername: config.host },
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      pool: true,
      maxConnections: 5,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    return transporter;
  };

  return {
    async verify() {
      try {
        await (await connect()).verify();
      } catch (err) {
        throw describeVerifyError(err, config);
      }
    },
    async send(email) {
      try {
        const info = await (await connect()).sendMail({
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
    close: () => transporter?.close(),
  };
}
