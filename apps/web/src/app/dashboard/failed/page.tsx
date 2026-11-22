import { prisma } from "@mailclock/db";
import { AutoRefresh } from "@/components/client";
import { EmailTable } from "@/components/email-table";
import { RetryAllButton } from "@/components/email-actions";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Failed emails" };

export default async function FailedPage() {
  const { project } = await requireProject();
  const rows = await prisma.email.findMany({
    where: { projectId: project.id, status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { provider: { select: { name: true } } },
  });

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Failed emails"
        description="These emails ran out of attempts or were rejected outright. Fix the cause, then send them again."
        actions={rows.length > 0 ? <RetryAllButton count={rows.length} /> : undefined}
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Nothing has failed">
            When a provider rejects an email or every retry fails, it lands here with the provider&apos;s reason.
          </EmptyState>
        ) : (
          <EmailTable rows={rows} showError />
        )}
      </Panel>
    </>
  );
}
