import type { Email } from "@mailclock/db";
import Link from "next/link";
import { LocalTime } from "@/components/client";
import { isInFlight } from "@mailclock/core/status";
import { StatusBadge } from "@/components/ui";
import { recipients } from "@/lib/format";

type Row = Pick<Email, "id" | "subject" | "to" | "status" | "nextAttemptAt" | "sentAt" | "updatedAt" | "source" | "attempts" | "lastError" | "tags"> & {
  provider: { name: string } | null;
};

/** The time that matters for each status: when it went, or when it will go. */
function whenFor(e: Row) {
  if (e.status === "SENT" && e.sentAt) return { label: "Sent", at: e.sentAt };
  if (isInFlight(e.status)) return { label: e.status === "RETRYING" ? "Next try" : "Sends", at: e.nextAttemptAt };
  return { label: e.status === "FAILED" ? "Failed" : "Cancelled", at: e.updatedAt };
}

const SOURCE_LABEL = { DASHBOARD: "Dashboard", API: "API", MCP: "MCP", CLI: "CLI" } as const;

export function EmailTable({ rows, showError = false }: { rows: Row[]; showError?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-soft">
            <th scope="col" className="px-5 py-2.5 font-medium">Email</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-3 py-2.5 font-medium">When</th>
            <th scope="col" className="px-3 py-2.5 font-medium">From</th>
            <th scope="col" className="px-5 py-2.5 text-right font-medium">Tries</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((e) => {
            const when = whenFor(e);
            return (
              <tr key={e.id} className="group relative hover:bg-paper">
                <td className="max-w-0 px-5 py-3">
                  <Link href={`/dashboard/emails/${e.id}`} className="after:absolute after:inset-0">
                    <span className="block truncate font-medium">{e.subject}</span>
                  </Link>
                  <span className="block truncate text-[13px] text-ink-faint">
                    {recipients(e.to)}
                    {e.tags.length > 0 && <span className="ml-2 text-ink-soft">{e.tags.map((t) => `#${t}`).join(" ")}</span>}
                  </span>
                  {showError && e.lastError && <span className="mt-1 block truncate text-[13px] text-failed">{e.lastError}</span>}
                </td>
                <td className="px-3 py-3 align-top">
                  <StatusBadge status={e.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top">
                  <span className="text-ink-faint">{when.label} </span>
                  <LocalTime iso={when.at.toISOString()} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-ink-soft">
                  {SOURCE_LABEL[e.source]}
                  {e.provider && <span className="text-ink-faint"> via {e.provider.name}</span>}
                </td>
                <td className="px-5 py-3 text-right align-top tabular-nums text-ink-soft">{e.attempts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
