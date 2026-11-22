import { headers } from "next/headers";
import { CopyButton } from "@/components/client";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireProject } from "@/lib/session";

export const metadata = { title: "Connect your app" };

function Snippet({ title, description, code }: { title: string; description: React.ReactNode; code: string }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
        </div>
        <CopyButton value={code} />
      </div>
      <pre className="mt-3 overflow-x-auto rounded-b-lg border-t border-line bg-ink px-5 py-4 font-mono text-[13px] leading-relaxed text-[#e6ebf1]">
        {code}
      </pre>
    </Panel>
  );
}

export default async function ConnectPage() {
  await requireProject();
  const h = await headers();
  const origin = process.env.BETTER_AUTH_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const curl = `curl -X POST ${origin}/api/v1/emails \\
  -H "Authorization: Bearer $MAILCLOCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: welcome-user-42" \\
  -d '{
    "to": "ada@example.com",
    "subject": "Welcome aboard",
    "text": "Thanks for signing up.",
    "sendAt": "${new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)}:00Z",
    "tags": ["onboarding"]
  }'`;

  const node = `const res = await fetch("${origin}/api/v1/emails", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.MAILCLOCK_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: user.email,
    subject: "Your trial ends tomorrow",
    html: "<p>Upgrade to keep your projects.</p>",
    sendAt: trialEndsAt.toISOString(),
    idempotencyKey: \`trial-ending-\${user.id}\`,
  }),
});
const { data: email } = await res.json(); // email.id, email.status`;

  const mcp = `{
  "mcpServers": {
    "mailclock": {
      "type": "http",
      "url": "${origin}/api/mcp",
      "headers": { "Authorization": "Bearer mc_live_..." }
    }
  }
}`;

  return (
    <>
      <PageHeader
        title="Connect your app"
        description="Everything talks to the same API with an API key: your backend, the CLI, and AI agents over MCP."
        actions={<ButtonLink href="/dashboard/keys">Create an API key</ButtonLink>}
      />
      <div className="grid max-w-4xl gap-6">
        <Snippet title="From your terminal" description="Schedule an email for this time tomorrow." code={curl} />
        <Snippet
          title="From your backend"
          description="Use an idempotency key so a retried request never schedules the same email twice."
          code={node}
        />
        <Snippet
          title="From an AI agent (MCP)"
          description={
            <>
              Add Mailclock to Claude Code, Claude Desktop, Cursor, or any MCP client. The agent can schedule, reschedule, cancel,
              and check on emails. Give it a key with a daily limit.
            </>
          }
          code={mcp}
        />
      </div>
    </>
  );
}
