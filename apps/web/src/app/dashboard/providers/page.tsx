import { listProviders } from "@mailclock/core";
import { AddProviderForm, ProviderRowActions } from "@/components/provider-forms";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Providers" };

const TYPE_LABEL = { MOCK: "Mock", SMTP: "SMTP", RESEND: "Resend" } as const;

export default async function ProvidersPage() {
  const { project } = await requireProject();
  const providers = await listProviders(project.id);

  return (
    <>
      <PageHeader
        title="Providers"
        description="Mailclock schedules and tracks your emails; a provider delivers them. Credentials are encrypted before they are stored."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          {providers.length === 0 ? (
            <EmptyState title="No providers yet">Add one to start sending. Use Mock to try things out without sending real email.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {providers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {p.name}
                      {p.isDefault && <span className="ml-2 rounded-full bg-cobalt-wash px-2 py-0.5 text-xs font-medium text-cobalt">Default</span>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-faint">
                      {TYPE_LABEL[p.type]}
                      {p.defaultFrom && <span className="ml-3">From {p.defaultFrom}</span>}
                      <span className="ml-3">{p.ratePerHour ? `Up to ${p.ratePerHour.toLocaleString()} an hour` : "No hourly limit"}</span>
                    </p>
                    {p.type === "MOCK" && (
                      <p className="mt-1 text-[13px] text-ink-soft">
                        Nothing leaves Mailclock. Send to bounce@… to see a failure, or flaky@… to see retries.
                      </p>
                    )}
                  </div>
                  <ProviderRowActions id={p.id} name={p.name} isDefault={p.isDefault} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Add a provider</h2>
          <div className="mt-5">
            <AddProviderForm />
          </div>
        </Panel>
      </div>
    </>
  );
}
