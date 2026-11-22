"use client";

import type { Timeline as TimelineData, TimelineStatus } from "@mailclock/core";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const COLORS: Record<TimelineStatus, string> = {
  SENT: "var(--color-sent)",
  FAILED: "var(--color-failed)",
  SCHEDULED: "var(--color-cobalt)",
  RETRYING: "var(--color-retry)",
};
const ORDER: TimelineStatus[] = ["FAILED", "SENT", "RETRYING", "SCHEDULED"];
const LEGEND: [TimelineStatus, string][] = [
  ["SENT", "Sent"],
  ["FAILED", "Failed"],
  ["SCHEDULED", "Scheduled"],
  ["RETRYING", "Waiting to retry"],
];
const PAST_HOURS = 6;

const hourFmt = () => new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const slotFmt = () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * A 24-hour rail: the last 6 hours left of "now", the next 18 to the right. Each 15-minute slot
 * stacks the emails sent, failed, or due in it. Counts arrive pre-binned from the server.
 */
export function Timeline({ timeline }: { timeline: TimelineData }) {
  // Hour labels use the viewer's timezone, so they render after mount.
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);

  const { bins, binMinutes } = timeline;
  const start = new Date(timeline.startIso).getTime();
  const span = bins.length * binMinutes * 60_000;
  const max = Math.max(1, ...bins.map((b) => b.SENT + b.FAILED + b.SCHEDULED + b.RETRYING));
  const nowPct = (PAST_HOURS * 60 * 60_000 * 100) / span;
  const hours = Array.from({ length: span / 3_600_000 + 1 }, (_, h) => {
    const t = new Date(start + h * 3_600_000);
    t.setMinutes(0, 0, 0);
    return t;
  });

  const pastBins = bins.slice(0, (PAST_HOURS * 60) / binMinutes);
  const futureBins = bins.slice(pastBins.length);
  const sum = (list: typeof bins, s: TimelineStatus) => list.reduce((n, b) => n + b[s], 0);
  const label = `${sum(pastBins, "SENT")} sent and ${sum(pastBins, "FAILED")} failed in the last 6 hours; ${
    sum(futureBins, "SCHEDULED") + sum(futureBins, "RETRYING")
  } due in the next 18 hours.`;
  const hf = hourFmt();
  const sf = slotFmt();

  return (
    <figure aria-label={label}>
      <div className="relative h-28" role="img" aria-label={label}>
        <div className="absolute inset-y-0 left-0 rounded-l bg-paper" style={{ width: `${nowPct}%` }} />
        <div className="absolute inset-0 flex items-end gap-px">
          {bins.map((b, i) => {
            const total = b.SENT + b.FAILED + b.SCHEDULED + b.RETRYING;
            return (
              <div
                key={i}
                className="relative flex h-full flex-1 flex-col justify-end"
                title={total && local ? `${total} email${total === 1 ? "" : "s"} at ${sf.format(new Date(start + i * binMinutes * 60_000))}` : undefined}
              >
                {ORDER.map((s) =>
                  b[s] ? <div key={s} style={{ height: `${(b[s] / max) * 100}%`, background: COLORS[s], minHeight: 3 }} /> : null,
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${nowPct}%` }}>
          <span className="absolute -top-6 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">Now</span>
        </div>
      </div>
      <div className="relative mt-2 h-4 border-t border-line text-[11px] text-ink-faint">
        {hours.map((h, i) => {
          const pct = ((h.getTime() - start) / span) * 100;
          // Labels every 3h on wide screens, every 6h on phones; skip ones that would hang off either edge.
          if (i % 3 !== 0 || pct < 3 || pct > 97) return null;
          return (
            <span key={i} className={cn("absolute -translate-x-1/2 whitespace-nowrap pt-1", i % 6 !== 0 && "hidden sm:inline")} style={{ left: `${pct}%` }}>
              {local ? hf.format(h) : ""}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-soft">
        {LEGEND.map(([s, text]) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLORS[s] }} />
            {text}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
