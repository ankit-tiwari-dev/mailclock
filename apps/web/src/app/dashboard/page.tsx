import { PENDING_STATUSES, getStats } from "@mailclock/core";
import { prisma } from "@mailclock/db";
import Link from "next/link";
import { AutoRefresh, LocalTime } from "@/components/client";
import { Timeline, type TimelinePoint } from "@/components/timeline";
import { ButtonLink, EmptyState, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { recipients, relativeTime } from "@/lib/format";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { project } = await requireProject();
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 3_600_000);
  const to = new Date(now.getTime() + 18 * 3_600_000);

  const [stats, sentOrFailed, upcoming, recentlyFailed, keyCount, realProviders] = await Promise.all([
    getStats(project.id),
    prisma.email.findMany({
      where: { projectId: project.id, OR: [{ status: "SENT", sentAt: { gte: from } }, { status: "FAILED", updatedAt: { gte: from } }] },
      select: { status: true, sentAt: true, updatedAt: true },
      take: 5000,
    }),
    prisma.email.findMany({
      where: { projectId: project.id, status: { in: [...PENDING_STATUSES] }, nextAttemptAt: { lte: to } },
      select: { id: true, status: true, nextAttemptAt: true, subject: true, to: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 5000,
    }),
    prisma.email.findMany({
      where: { projectId: project.id, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, subject: true, to: true, lastError: true, updatedAt: true },
    }),
    prisma.apiKey.count({ where: { projectId: project.id, revokedAt: null } }),
    prisma.provider.count({ where: { projectId: project.id, type: { not: "MOCK" } } }),
  ]);

  const points: TimelinePoint[] = [
    ...sentOrFailed.map((e) => ({
      at: (e.status === "SENT" ? e.sentAt! : e.updatedAt).toISOString(),
      status: e.status as "SENT" | "FAILED",
    })),
    ...upcoming.map((e) => ({ at: e.nextAttemptAt.toISOString(), status: e.status as "SCHEDULED" | "RETRYING" })),
  ];

  const figures = [
    { label: "sent in the last 24 hours", value: stats.last24h.sent, href: "/dashboard/emails?status=SENT" },
    { label: "failed in the last 24 hours", value: stats.last24h.failed, href: "/dashboard/failed", alarm: stats.last24h.failed > 0 },
    { label: "due in the next 24 hours", value: stats.next24h.scheduled, href: "/dashboard/emails?status=SCHEDULED" },
    { label: "waiting to retry", value: stats.counts.RETRYING, href: "/dashboard/emails?status=RETRYING" },
  ];

  const setupSteps = [
    { done: realProviders > 0, title: "Connect a provider", body: "Add SMTP or Resend credentials so emails actually leave Mailclock.", href: "/dashboard/providers" },
    { done: keyCount > 0, title: "Create an API key", body: "Your app, the CLI, and MCP clients all authenticate with one.", href: "/dashboard/keys" },
    { done: stats.counts.SENT > 0, title: "Send your first email", body: "Schedule one from the dashboard, or with a single curl.", href: "/dashboard/compose" },
  ];
  const setupDone = setupSteps.every((s) => s.done);

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Overview"
        description={`What ${project.name} has sent and what it will send next.`}
        actions={<ButtonLink href="/dashboard/compose">Schedule an email</ButtonLink>}
      />

      {!setupDone && (
        <Panel className="mb-6 p-5" aria-labelledby="setup-heading">
          <h2 id="setup-heading" className="font-semibold">
            Finish setting up {project.name}
          </h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {setupSteps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    s.done ? "bg-sent text-white" : "border border-line-strong text-ink-soft"
                  }`}
                  aria-hidden
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div>
                  <Link href={s.href} className={`text-sm font-medium hover:underline ${s.done ? "text-ink-faint line-through" : ""}`}>
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel className="px-5 pb-5 pt-9">
        <Timeline points={points} nowIso={now.toISOString()} />
      </Panel>

      <div className="mt-6 grid grid-cols-2 gap-y-6 border-y border-line py-6 lg:grid-cols-4">
        {figures.map((f) => (
          <Link key={f.label} href={f.href} className="group px-1 lg:border-l lg:border-line lg:px-5 lg:first:border-l-0 lg:first:pl-1">
            <p className={`text-3xl font-semibold tabular-nums tracking-tight ${f.alarm ? "text-failed" : ""}`}>{f.value}</p>
            <p className="mt-1 text-sm text-ink-soft group-hover:text-ink">{f.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Panel>
          <h2 className="border-b border-line px-5 py-3.5 font-semibold">Coming up</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing is scheduled for the next 18 hours">
              Emails you schedule from the API, CLI, MCP, or this dashboard will line up here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={`/dashboard/emails/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-paper">
                    <div className="w-24 shrink-0 text-sm font-medium tabular-nums sm:w-28">{relativeTime(e.nextAttemptAt)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.subject}</p>
                      <p className="truncate text-[13px] text-ink-faint">{recipients(e.to)}</p>
                    </div>
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h2 className="border-b border-line px-5 py-3.5 font-semibold">Needs attention</h2>
          {recentlyFailed.length === 0 ? (
            <EmptyState title="No failed emails">When a send fails for good, it shows up here with the reason.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recentlyFailed.map((e) => (
                <li key={e.id}>
                  <Link href={`/dashboard/emails/${e.id}`} className="block px-5 py-3 hover:bg-paper">
                    <div className="flex justify-between gap-4">
                      <p className="truncate text-sm">{e.subject}</p>
                      <span className="shrink-0 text-[13px] text-ink-faint">
                        <LocalTime iso={e.updatedAt.toISOString()} />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-failed">{e.lastError}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
