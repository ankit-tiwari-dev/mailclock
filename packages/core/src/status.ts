// The one home for email status groups and the actions each status allows.
// Pure (type-only imports), so client components can import it as "@mailclock/core/status".
// Anything that asks "is this email still waiting / can it be cancelled?" uses these, never its
// own list of status strings; scripts/ownership-check.mjs rejects new hand-written lists.
import type { EmailStatus } from "@mailclock/db";

export const EMAIL_STATUSES = ["SCHEDULED", "SENDING", "RETRYING", "SENT", "FAILED", "CANCELLED"] as const satisfies readonly EmailStatus[];

/** Waiting for the dispatcher. Can still be rescheduled or cancelled. */
export const PENDING_STATUSES = ["SCHEDULED", "RETRYING"] as const satisfies readonly EmailStatus[];

/** Not finished yet: pending, or being sent right now. */
export const IN_FLIGHT_STATUSES = [...PENDING_STATUSES, "SENDING"] as const satisfies readonly EmailStatus[];

/** Nothing will happen to these again unless someone retries a failure. */
export const FINAL_STATUSES = ["SENT", "FAILED", "CANCELLED"] as const satisfies readonly EmailStatus[];

const has = (list: readonly string[], status: string) => list.includes(status);

export const isPending = (status: EmailStatus) => has(PENDING_STATUSES, status);
export const isInFlight = (status: EmailStatus) => has(IN_FLIGHT_STATUSES, status);

/** Actions a person or agent may take on an email in this status. */
export const allowedActions = (status: EmailStatus) => ({
  reschedule: isPending(status),
  cancel: isPending(status),
  retry: status === "FAILED",
});
