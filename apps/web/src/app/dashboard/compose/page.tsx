import { listProviders } from "@mailclock/core";
import { ComposeForm } from "@/components/compose-form";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Schedule an email" };

export default async function ComposePage() {
  const { project } = await requireProject();
  const providers = await listProviders(project.id);

  return (
    <>
      <PageHeader
        title="Schedule an email"
        description="Send to one person or a whole list. Each recipient gets their own email, so one bounce never blocks the rest."
      />
      {providers.length === 0 ? (
        <Panel>
          <EmptyState title="Add a provider first" action={<ButtonLink href="/dashboard/providers">Add a provider</ButtonLink>}>
            Mailclock needs SMTP or Resend credentials (or the Mock provider for testing) before it can send anything.
          </EmptyState>
        </Panel>
      ) : (
        <ComposeForm
          providers={providers.map((p) => ({ id: p.id, name: p.name, type: p.type, defaultFrom: p.defaultFrom, isDefault: p.isDefault }))}
        />
      )}
    </>
  );
}
