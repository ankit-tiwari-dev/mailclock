import { EMAIL_STATUSES, listEmails, listEmailsSchema } from "@mailclock/core";
import Link from "next/link";
import { AutoRefresh } from "@/components/client";
import { EmailTable } from "@/components/email-table";
import { ButtonLink, EmptyState, Input, PageHeader, Panel, STATUS_META } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Emails" };

export default async function EmailsPage(props: PageProps<"/dashboard/emails">) {
  const { project } = await requireProject();
  const raw = await props.searchParams;
  const parsed = listEmailsSchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v !== "")),
  );
  const query = parsed.success ? parsed.data : listEmailsSchema.parse({});
  const { items, nextCursor } = await listEmails(project.id, { ...query, limit: 50 });

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: query.status, q: query.q, tag: query.tag, source: query.source, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/dashboard/emails${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Emails"
        description="Every email in this project, newest first. Open one to see each attempt and what the provider said."
        actions={<ButtonLink href="/dashboard/compose">Schedule an email</ButtonLink>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
          {[undefined, ...EMAIL_STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={href({ status: s, cursor: undefined })}
              aria-current={query.status === s ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                query.status === s ? "bg-ink text-white" : "text-ink-soft hover:bg-muted-wash hover:text-ink",
              )}
            >
              {s ? STATUS_META[s].label : "All"}
            </Link>
          ))}
        </nav>
        <form className="w-full sm:w-72" role="search">
          {query.status && <input type="hidden" name="status" value={query.status} />}
          <label htmlFor="q" className="sr-only">
            Search by subject or recipient
          </label>
          <Input id="q" name="q" defaultValue={query.q} placeholder="Search subject or exact recipient" />
        </form>
      </div>

      <Panel>
        {items.length === 0 ? (
          <EmptyState
            title={query.status || query.q ? "No emails match these filters" : "No emails yet"}
            action={
              query.status || query.q ? (
                <ButtonLink variant="secondary" href="/dashboard/emails">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/dashboard/compose">Schedule an email</ButtonLink>
              )
            }
          >
            {query.status || query.q ? undefined : "Schedule one here, or send it from your app with an API key."}
          </EmptyState>
        ) : (
          <EmailTable rows={items} />
        )}
      </Panel>

      {nextCursor && (
        <div className="mt-4 flex justify-end">
          <ButtonLink variant="secondary" href={href({ cursor: nextCursor })}>
            Older emails
          </ButtonLink>
        </div>
      )}
    </>
  );
}
