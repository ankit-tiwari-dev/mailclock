"use client";

import { useEffect, useMemo, useState } from "react";
import { isPending } from "@mailclock/core/status";
import { cn } from "@/lib/cn";

export type TimelinePoint = { at: string; status: "SENT" | "FAILED" | "SCHEDULED" | "RETRYING" };

const PAST_H = 6;
const FUTURE_H = 18;
const BIN_MIN = 15;
const BINS = ((PAST_H + FUTURE_H) * 60) / BIN_MIN;

const COLORS: Record<TimelinePoint["status"], string> = {
  SENT: "var(--color-sent)",
  FAILED: "var(--color-failed)",
  SCHEDULED: "var(--color-cobalt)",
  RETRYING: "var(--color-retry)",
};
const ORDER: TimelinePoint["status"][] = ["FAILED", "SENT", "RETRYING", "SCHEDULED"];

/**
 * A 24-hour rail: the last 6 hours on the left of "now", the next 18 on the right.
 * Each 15-minute slot stacks the emails sent, failed, or due in it.
 */
export function Timeline({ points, nowIso }: { points: TimelinePoint[]; nowIso: string }) {
  // Hour labels need the viewer's timezone, so they render after mount.
  const [tz, setTz] = useState(false);
  useEffect(() => setTz(true), []);

  const now = new Date(nowIso).getTime();
  const start = now - PAST_H * 3_600_000;
  const span = (PAST_H + FUTURE_H) * 3_600_000;

  const bins = useMemo(() => {
    const out = Array.from({ length: BINS }, () => ({ SENT: 0, FAILED: 0, SCHEDULED: 0, RETRYING: 0 }));
    for (const p of points) {
      const i = Math.floor(((new Date(p.at).getTime() - start) / span) * BINS);
      if (i >= 0 && i < BINS) out[i]![p.status] += 1;
    }
    return out;
  }, [points, start, span]);

  const max = Math.max(1, ...bins.map((b) => b.SENT + b.FAILED + b.SCHEDULED + b.RETRYING));
  const hours = Array.from({ length: PAST_H + FUTURE_H + 1 }, (_, h) => {
    const t = new Date(start + h * 3_600_000);
    t.setMinutes(0, 0, 0);
    return t;
  });
  const nowPct = (PAST_H / (PAST_H + FUTURE_H)) * 100;
  const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const slotFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  const label = `${points.filter((p) => p.status === "SENT").length} sent and ${
    points.filter((p) => p.status === "FAILED").length
  } failed in the last 6 hours; ${points.filter((p) => isPending(p.status)).length} due in the next 18 hours.`;

  return (
    <figure aria-label={label}>
      <div className="relative h-28" role="img" aria-label={label}>
        {/* past shading */}
        <div className="absolute inset-y-0 left-0 rounded-l bg-paper" style={{ width: `${nowPct}%` }} />
        <div className="absolute inset-0 flex items-end gap-px">
          {bins.map((b, i) => {
            const total = b.SENT + b.FAILED + b.SCHEDULED + b.RETRYING;
            const slotStart = new Date(start + i * BIN_MIN * 60_000);
            return (
              <div
                key={i}
                className="relative flex h-full flex-1 flex-col justify-end"
                title={total && tz ? `${total} email${total === 1 ? "" : "s"} at ${slotFmt.format(slotStart)}` : undefined}
              >
                {ORDER.map((s) =>
                  b[s] ? (
                    <div key={s} style={{ height: `${(b[s] / max) * 100}%`, background: COLORS[s], minHeight: 3 }} />
                  ) : null,
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${nowPct}%` }}>
          <span className="absolute -top-6 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">
            Now
          </span>
        </div>
      </div>
      <div className="relative mt-2 h-4 border-t border-line text-[11px] text-ink-faint">
        {hours.map((h, i) => {
          const pct = ((h.getTime() - start) / span) * 100;
          // Labels every 3h on wide screens, every 6h on phones; skip ones that would hang off either edge.
          if (i % 3 !== 0 || pct < 3 || pct > 97) return null;
          return (
            <span
              key={i}
              className={cn("absolute -translate-x-1/2 whitespace-nowrap pt-1", i % 6 !== 0 && "hidden sm:inline")}
              style={{ left: `${pct}%` }}
            >
              {tz ? fmt.format(h) : ""}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-soft">
        {(["SENT", "FAILED", "SCHEDULED", "RETRYING"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLORS[s] }} />
            {s === "SENT" ? "Sent" : s === "FAILED" ? "Failed" : s === "SCHEDULED" ? "Scheduled" : "Waiting to retry"}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
