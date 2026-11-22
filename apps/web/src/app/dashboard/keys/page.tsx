import { listApiKeys } from "@mailclock/core";
import { LocalTime } from "@/components/client";
import { CreateKeyForm, RevokeKeyButton } from "@/components/key-forms";
import { Code, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireProject } from "@/lib/session";

export const metadata = { title: "API keys" };

export default async function KeysPage() {
  const { project } = await requireProject();
  const keys = await listApiKeys(project.id);

  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            Your app, scripts, and MCP clients use these to schedule and read emails in {project.name}. Send one as{" "}
            <Code>Authorization: Bearer mc_live_…</Code>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {keys.length === 0 ? (
            <EmptyState title="No API keys yet">Create one to schedule emails from your code or an AI agent.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{k.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-faint">
                      <span className="font-mono">{k.prefix}…</span>
                      <span className="ml-3">{k.scopes.includes("emails:write") ? "Read and schedule" : "Read only"}</span>
                      {k.dailyQuota && <span className="ml-3">Up to {k.dailyQuota.toLocaleString()} emails a day</span>}
                    </p>
                  </div>
                  <p className="text-[13px] text-ink-soft">
                    {k.lastUsedAt ? (
                      <>
                        Last used <LocalTime iso={k.lastUsedAt.toISOString()} />
                      </>
                    ) : (
                      "Never used"
                    )}
                  </p>
                  <RevokeKeyButton id={k.id} name={k.name} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Create a key</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Giving a key to an AI agent? Set a daily limit so a runaway loop can&apos;t send thousands of emails.
          </p>
          <div className="mt-5">
            <CreateKeyForm />
          </div>
        </Panel>
      </div>
    </>
  );
}
