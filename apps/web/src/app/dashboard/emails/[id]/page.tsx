import { MailclockError, getEmail } from "@mailclock/core";
import { prisma } from "@mailclock/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, CopyButton, LocalTime } from "@/components/client";
import { EmailActions } from "@/components/email-actions";
import { Panel, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Email" };

type EventData = { attempt?: number; attempts?: number; error?: string; retryAt?: string; messageId?: string; provider?: string; sendAt?: string; source?: string; ratePerHour?: number };

const SOURCE_PHRASE: Record<string, string> = { API: "through the API", MCP: "by an AI agent (MCP)", CLI: "from the CLI", DASHBOARD: "from the dashboard" };

const EVENT_COPY: Record<string, { title: (d: EventData) => string; tone: string }> = {
  CREATED: { title: (d) => `Scheduled ${SOURCE_PHRASE[d.source ?? "API"] ?? "through the API"}`, tone: "bg-cobalt" },
  RESCHEDULED: { title: () => "Rescheduled", tone: "bg-cobalt" },
  CANCELLED: { title: () => "Cancelled", tone: "bg-ink-faint" },
  ATTEMPT_STARTED: { title: (d) => `Attempt ${d.attempt ?? ""} started`, tone: "bg-cobalt" },
  SENT: { title: (d) => `Sent on attempt ${d.attempt ?? 1}${d.provider ? ` via ${d.provider}` : ""}`, tone: "bg-sent" },
  ATTEMPT_FAILED: { title: (d) => `Attempt ${d.attempt ?? ""} failed`, tone: "bg-retry" },
  FAILED: { title: (d) => (d.attempts === 1 ? "Rejected by the provider" : `Gave up after ${d.attempts ?? "all"} attempts`), tone: "bg-failed" },
  RETRY_REQUESTED: { title: () => "Sent again by hand", tone: "bg-cobalt" },
  RATE_LIMITED: { title: (d) => `Held back by the ${d.ratePerHour}/hour limit`, tone: "bg-retry" },
};

async function actorName(actor: string | null) {
  if (!actor) return "Mailclock";
  const [kind, id] = actor.split(":");
  if (kind === "key" && id) {
    const key = await prisma.apiKey.findUnique({ where: { id }, select: { name: true } });
    return key ? `API key "${key.name}"` : "a deleted API key";
  }
  if (kind === "user" && id) {
    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    return user?.name ?? "a teammate";
  }
  return actor;
}

export default async function EmailPage(props: PageProps<"/dashboard/emails/[id]">) {
  const { project } = await requireProject();
  const { id } = await props.params;
  const email = await getEmail(project.id, id).catch((e) => {
    if (e instanceof MailclockError && e.code === "not_found") notFound();
    throw e;
  });
  const createdBy = await actorName(email.actor);
  const live = email.status === "SCHEDULED" || email.status === "SENDING" || email.status === "RETRYING";

  const details: [string, React.ReactNode][] = [
    ["From", email.from],
    ["To", email.to.join(", ")],
    ...(email.cc.length ? [["Cc", email.cc.join(", ")] as [string, string]] : []),
    ...(email.bcc.length ? [["Bcc", email.bcc.join(", ")] as [string, string]] : []),
    ...(email.replyTo ? [["Reply to", email.replyTo] as [string, string]] : []),
  ];

  const facts: [string, React.ReactNode][] = [
    ["Created by", createdBy],
    ["Provider", email.provider?.name ?? "Deleted provider"],
    ["Attempts", `${email.attempts} of ${email.maxAttempts}`],
    ...(email.providerMessageId ? [["Provider message ID", <span key="m" className="break-all font-mono text-[12px]">{email.providerMessageId}</span>] as [string, React.ReactNode]] : []),
    ...(email.idempotencyKey ? [["Idempotency key", <span key="k" className="break-all font-mono text-[12px]">{email.idempotencyKey}</span>] as [string, React.ReactNode]] : []),
    ...(email.tags.length ? [["Tags", email.tags.map((t) => `#${t}`).join(" ")] as [string, string]] : []),
  ];

  return (
    <>
      {live && <AutoRefresh intervalMs={3000} />}
      <Link href="/dashboard/emails" className="text-sm text-ink-soft hover:text-ink">
        All emails
      </Link>
      <header className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StatusBadge status={email.status} />
            <span className="text-sm text-ink-soft">
              {email.status === "SENT" && email.sentAt ? (
                <>Sent <LocalTime iso={email.sentAt.toISOString()} /></>
              ) : live ? (
                <>{email.status === "RETRYING" ? "Next try" : "Sends"} <LocalTime iso={email.nextAttemptAt.toISOString()} /></>
              ) : null}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{email.subject}</h1>
        </div>
        <EmailActions id={email.id} status={email.status} sendAtIso={email.nextAttemptAt.toISOString()} />
      </header>

      {email.status === "FAILED" && email.lastError && (
        <div role="alert" className="mb-6 rounded-lg border border-failed/30 bg-failed-wash px-4 py-3 text-sm">
          <p className="font-medium text-failed">The provider said</p>
          <p className="mt-1 font-mono text-[13px] text-ink">{email.lastError}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <dl className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 border-b border-line px-5 py-4 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-faint">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {email.html ? (
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={email.html}
              className="h-[520px] w-full rounded-b-lg bg-white"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words px-5 py-5 font-sans text-[15px] leading-relaxed">{email.text}</pre>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="font-semibold">What happened</h2>
            <ol className="mt-4">
              {email.events.map((ev, i) => {
                const data = (ev.data ?? {}) as EventData;
                const copy = EVENT_COPY[ev.type] ?? { title: () => ev.type, tone: "bg-ink-faint" };
                const last = i === email.events.length - 1;
                return (
                  <li key={ev.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {!last && <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-line" />}
                    <span aria-hidden className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", copy.tone)} />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{copy.title(data)}</p>
                      <p className="text-[13px] text-ink-faint">
                        <LocalTime iso={ev.createdAt.toISOString()} withSeconds />
                      </p>
                      {data.error && <p className="mt-1 break-words font-mono text-[12px] text-failed">{data.error}</p>}
                      {data.retryAt && (
                        <p className="mt-1 text-[13px] text-ink-soft">
                          {ev.type === "RATE_LIMITED" ? "Will send" : "Retrying"} at <LocalTime iso={data.retryAt} withSeconds />
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel className="p-5">
            <dl className="space-y-3 text-sm">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[13px] text-ink-faint">{k}</dt>
                  <dd className="mt-0.5">{v}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[13px] text-ink-faint">Email ID</dt>
                <dd className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[12px]">{email.id}</span>
                  <CopyButton value={email.id} />
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
