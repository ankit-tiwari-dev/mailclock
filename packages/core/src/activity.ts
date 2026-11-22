// Read models for the dashboard: what a project sent, failed, and will send next. Pages render
// these; they do not query the database themselves (dependency-cruiser rule web-ui-not-to-db).
import { prisma } from "@mailclock/db";
import { getStats } from "./emails";
import { PENDING_STATUSES } from "./status";

export const TIMELINE = { pastHours: 6, futureHours: 18, binMinutes: 15 } as const;
export const TIMELINE_BINS = ((TIMELINE.pastHours + TIMELINE.futureHours) * 60) / TIMELINE.binMinutes;

export type TimelineStatus = "SENT" | "FAILED" | "SCHEDULED" | "RETRYING";
export type TimelineBin = Record<TimelineStatus, number>;
export type Timeline = { startIso: string; binMinutes: number; bins: TimelineBin[] };

/**
 * Counts per 15-minute slot from 6 hours ago to 18 hours ahead, computed in the database: the page
 * ships 96 small objects instead of every email row in the window.
 */
export async function getTimeline(projectId: string, now = new Date()): Promise<Timeline> {
  const start = new Date(now.getTime() - TIMELINE.pastHours * 3_600_000);
  const end = new Date(now.getTime() + TIMELINE.futureHours * 3_600_000);
  const rows = await prisma.$queryRaw<{ bin: number; status: TimelineStatus; n: number }[]>`
    SELECT floor(extract(epoch FROM (t - ${start}::timestamp)) / ${TIMELINE.binMinutes * 60})::int AS bin,
           status::text AS status, count(*)::int AS n
    FROM (
      SELECT status,
             CASE status WHEN 'SENT' THEN "sentAt" WHEN 'FAILED' THEN "updatedAt" ELSE "nextAttemptAt" END AS t
      FROM email
      WHERE "projectId" = ${projectId}::uuid
        AND status IN ('SENT', 'FAILED', 'SCHEDULED', 'RETRYING')
    ) e
    WHERE t >= ${start}::timestamp AND t < ${end}::timestamp
    GROUP BY 1, 2`;
  const bins: TimelineBin[] = Array.from({ length: TIMELINE_BINS }, () => ({ SENT: 0, FAILED: 0, SCHEDULED: 0, RETRYING: 0 }));
  for (const r of rows) if (r.bin >= 0 && r.bin < TIMELINE_BINS) bins[r.bin]![r.status] += r.n;
  return { startIso: start.toISOString(), binMinutes: TIMELINE.binMinutes, bins };
}

/** Everything the Overview page shows, in parallel. */
export async function getOverview(projectId: string, now = new Date()) {
  const horizon = new Date(now.getTime() + TIMELINE.futureHours * 3_600_000);
  const [stats, timeline, upcoming, recentlyFailed, keyCount, realProviders] = await Promise.all([
    getStats(projectId),
    getTimeline(projectId, now),
    prisma.email.findMany({
      where: { projectId, status: { in: [...PENDING_STATUSES] }, nextAttemptAt: { lte: horizon } },
      select: { id: true, status: true, nextAttemptAt: true, subject: true, to: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 6,
    }),
    prisma.email.findMany({
      where: { projectId, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, subject: true, to: true, lastError: true, updatedAt: true },
    }),
    prisma.apiKey.count({ where: { projectId, revokedAt: null } }),
    prisma.provider.count({ where: { projectId, type: { not: "MOCK" } } }),
  ]);
  return { stats, timeline, upcoming, recentlyFailed, setup: { keyCount, realProviders } };
}

/** The failed-email inbox: list columns only, never bodies. */
export function listFailed(projectId: string, limit = 200) {
  return prisma.email.findMany({
    where: { projectId, status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true, subject: true, to: true, status: true, nextAttemptAt: true, sentAt: true, updatedAt: true,
      source: true, attempts: true, lastError: true, tags: true, provider: { select: { name: true } },
    },
  });
}

export const countFailed = (projectId: string) => prisma.email.count({ where: { projectId, status: "FAILED" } });

/**
 * A readable name for who created an email ("key:<id>" / "user:<id>"), looked up only within the
 * project: a key from another project, or a user who does not own it, is never named.
 */
export async function describeActor(projectId: string, actor: string | null): Promise<string> {
  if (!actor) return "Mailclock";
  const [kind, id] = actor.split(":");
  if (kind === "key" && id) {
    const key = await prisma.apiKey.findFirst({ where: { id, projectId }, select: { name: true } });
    return key ? `API key "${key.name}"` : "a deleted API key";
  }
  if (kind === "user" && id) {
    const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: id }, select: { owner: { select: { name: true } } } });
    return project?.owner.name ?? "a former member";
  }
  return "an unknown actor";
}
