export type ErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_state"
  | "quota_exceeded"
  | "rate_limited"
  | "no_provider"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_state: 409,
  quota_exceeded: 429,
  rate_limited: 429,
  no_provider: 422,
  internal_error: 500,
};

/**
 * A limit is "no limit" (null/undefined) or a positive whole number. Anything else is rejected
 * rather than guessed at: 0 used to mean "unlimited" for a key and a negative rate meant "never".
 */
export function parseLimit(value: number | null | undefined, name: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new MailclockError("validation_error", `${name} must be a whole number of 1 or more, or empty for no limit`);
  }
  return value;
}

/** An error that is safe to show to API callers. */
export class MailclockError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MailclockError";
    this.status = STATUS[code];
  }
}
