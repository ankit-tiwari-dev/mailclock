import { Resend } from "resend";
import { z } from "zod";
import type { EmailTransport } from "./types";
import { ProviderError } from "./types";

export const resendConfigSchema = z.object({ apiKey: z.string().startsWith("re_") });
export type ResendConfig = z.infer<typeof resendConfigSchema>;

const RETRYABLE = new Set(["rate_limit_exceeded", "concurrent_idempotent_requests", "application_error", "internal_server_error"]);

function toProviderError(error: { name: string; message: string; statusCode: number | null }) {
  const retryable = RETRYABLE.has(error.name) || error.statusCode === null || error.statusCode >= 500;
  return new ProviderError(`Resend ${error.name}: ${error.message}`, !retryable);
}

export function resendTransport(config: ResendConfig): EmailTransport {
  const client = new Resend(config.apiKey);
  return {
    async verify() {
      const { error } = await client.domains.list();
      if (error) throw toProviderError(error);
    },
    async send(email) {
      const body = email.html ? { html: email.html, ...(email.text ? { text: email.text } : {}) } : { text: email.text ?? "" };
      const { data, error } = await client.emails.send(
        {
          from: email.from,
          to: email.to,
          cc: email.cc.length ? email.cc : undefined,
          bcc: email.bcc.length ? email.bcc : undefined,
          replyTo: email.replyTo ?? undefined,
          subject: email.subject,
          ...body,
        },
        // Resend de-duplicates on this key, so a retry after a timeout cannot double-send.
        { idempotencyKey: email.idempotencyKey },
      );
      if (error) throw toProviderError(error);
      return { messageId: data.id };
    },
  };
}
