"use client";

import { useState, useTransition } from "react";
import {
  cancelEmailAction,
  rescheduleEmailAction,
  retryAllFailedAction,
  retryEmailAction,
  type ActionResult,
} from "@/app/dashboard/actions";
import { allowedActions } from "@mailclock/core/status";
import type { EmailStatus } from "@mailclock/db";
import { Button, Input, Notice } from "@/components/ui";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const runAction = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      // The server action revalidates the dashboard, so no extra refresh round trip is needed.
      setResult(r);
    });
  return { pending, result, runAction };
}

/** "2026-11-22T14:30" in the viewer's local time, for datetime-local inputs. */
export function toLocalInputValue(date: Date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function EmailActions({ id, status, sendAtIso }: { id: string; status: EmailStatus; sendAtIso: string }) {
  const { pending, result, runAction } = useAction();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(sendAtIso)));
  const can = allowedActions(status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {can.reschedule && (
          <>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              Reschedule
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm("Cancel this email? It will not be sent.")) runAction(() => cancelEmailAction(id));
              }}
            >
              Cancel email
            </Button>
          </>
        )}
        {can.retry && (
          <Button size="sm" disabled={pending} onClick={() => runAction(() => retryEmailAction(id))}>
            Send again
          </Button>
        )}
      </div>
      {editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            runAction(() => rescheduleEmailAction(id, new Date(when).toISOString()));
          }}
        >
          <div>
            <label htmlFor="reschedule-at" className="mb-1 block text-[13px] text-ink-soft">
              New send time (your local time)
            </label>
            <Input id="reschedule-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className="w-56" />
          </div>
          <Button size="sm" type="submit" disabled={pending}>
            Save new time
          </Button>
        </form>
      )}
      {result && !result.ok && <Notice tone="error">{result.error}</Notice>}
      {result?.ok && result.message && <Notice tone="success">{result.message}</Notice>}
    </div>
  );
}

export function RetryAllButton({ count }: { count: number }) {
  const { pending, result, runAction } = useAction();
  return (
    <div className="flex items-center gap-3">
      {result && !result.ok && <span className="text-sm text-failed">{result.error}</span>}
      <Button
        disabled={pending}
        onClick={() => {
          if (confirm(`Send all ${count} failed emails again?`)) runAction(() => retryAllFailedAction());
        }}
      >
        {pending ? "Re-queuing…" : `Send all ${count} again`}
      </Button>
    </div>
  );
}
