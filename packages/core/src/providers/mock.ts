import { randomUUID } from "node:crypto";
import type { EmailTransport } from "./types";
import { ProviderError } from "./types";

/**
 * Sends nothing. Useful for local development and demos.
 * Magic recipients let you see failure paths in the dashboard:
 *   bounce@…  → permanent failure        flaky@…  → transient failure (retried)
 */
export function mockTransport(): EmailTransport {
  return {
    async verify() {},
    async send(email) {
      const all = [...email.to, ...email.cc, ...email.bcc].map((a) => a.toLowerCase());
      if (all.some((a) => a.startsWith("bounce@"))) throw new ProviderError("Mock: mailbox does not exist (550)", true);
      if (all.some((a) => a.startsWith("flaky@"))) throw new ProviderError("Mock: temporary failure (451)", false);
      await new Promise((r) => setTimeout(r, 150));
      return { messageId: `mock_${randomUUID()}` };
    },
  };
}
