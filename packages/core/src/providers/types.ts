export type OutgoingEmail = {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  /** Passed to providers that support it so retries are not delivered twice. */
  idempotencyKey: string;
};

export type SendResult = { messageId: string };

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<SendResult>;
  /** Checks credentials without sending. */
  verify(): Promise<void>;
  close?(): void;
}

/**
 * Thrown by transports. `permanent` errors (bad address, rejected auth, invalid
 * payload) are not retried; everything else is retried with backoff.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
