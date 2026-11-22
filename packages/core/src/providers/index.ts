import type { ProviderType } from "@mailclock/db";
import { decryptJson } from "../crypto";
import { MailclockError } from "../errors";
import { mockTransport } from "./mock";
import { resendConfigSchema, resendTransport } from "./resend";
import { smtpConfigSchema, smtpTransport } from "./smtp";
import type { EmailTransport } from "./types";

export * from "./types";
export { smtpConfigSchema, resendConfigSchema };

export const providerConfigSchemas = {
  MOCK: null,
  SMTP: smtpConfigSchema,
  RESEND: resendConfigSchema,
} as const;

/** Validates raw credentials for a provider type, throwing a `validation_error` on bad input. */
export function parseProviderConfig(type: ProviderType, raw: unknown): Record<string, unknown> {
  const schema = providerConfigSchemas[type];
  if (!schema) return {};
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new MailclockError("validation_error", "Invalid provider credentials", parsed.error.issues);
  return parsed.data;
}

export function createTransport(type: ProviderType, config: unknown): EmailTransport {
  switch (type) {
    case "MOCK":
      return mockTransport();
    case "SMTP":
      return smtpTransport(smtpConfigSchema.parse(config));
    case "RESEND":
      return resendTransport(resendConfigSchema.parse(config));
  }
}

export function transportForProvider(provider: { type: ProviderType; configEnc: string }): EmailTransport {
  return createTransport(provider.type, decryptJson(provider.configEnc));
}
