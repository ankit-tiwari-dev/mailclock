import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const GITHUB = "https://github.com/ankit-tiwari-dev/mailclock";

/** Static rail for the hero: what an agent's scheduled email looks like in Mailclock. */
function HeroRail() {
  const bars = [0, 2, 1, 3, 0, 4, 2, 1, 0, 0, 1, 2, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1];
  return (
    <div className="flex h-14 items-end gap-[3px]" aria-hidden>
      {bars.map((h, i) => (
        <div key={i} className="flex flex-1 flex-col justify-end">
          {h > 0 && (
            <div
              className={i < 9 ? (i === 5 ? "bg-failed" : "bg-sent") : i === 18 ? "bg-cobalt" : "bg-cobalt/40"}
              style={{ height: `${h * 12 + 4}px` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function AgentDemo() {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-[0_24px_60px_-30px_rgba(23,33,43,0.35)]">
      <div className="space-y-4 p-5 text-sm">
        <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-paper px-3.5 py-2.5">
          Remind Ada that her plan renews. Send it Monday at 9am.
        </p>
        <div className="rounded-lg border border-line">
          <p className="border-b border-line px-3.5 py-2 text-[13px] text-ink-soft">
            Called <span className="font-mono text-ink">schedule_email</span> on Mailclock
          </p>
          <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink-soft">
            {`{
  "to": "ada@example.com",
  "subject": "Your plan renews on Dec 1",
  "text": "Hi Ada, your plan renews on Dec 1.",
  "sendAt": "2026-11-30T09:00:00+05:30",
  "tags": ["billing"]
}`}
          </pre>
        </div>
        <p className="max-w-[85%] rounded-lg px-1">
          Done. It&apos;s scheduled for Monday 9:00, and you can see it in your Mailclock dashboard.
        </p>
      </div>
      <div className="border-t border-line px-5 pb-4 pt-5">
        <HeroRail />
        <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
          <span>Earlier today</span>
          <span>Monday 9:00</span>
        </div>
      </div>
    </div>
  );
}

const WAYS = [
  {
    title: "REST API",
    body: "One POST to schedule, with idempotency keys so retries never double-send. Cancel or move an email until the moment it goes.",
    code: `POST /api/v1/emails
{ "to": "ada@example.com",
  "subject": "Welcome",
  "text": "Thanks for signing up.",
  "sendAt": "2026-12-01T09:00:00Z" }`,
  },
  {
    title: "MCP",
    body: "Claude, Cursor, and other agents can schedule, reschedule, cancel, and check on emails. Per-key daily limits and rate limits keep them in bounds.",
    code: `"mailclock": {
  "type": "http",
  "url": "https://…/api/mcp",
  "headers": { "Authorization": "Bearer mc_live_…" }
}`,
  },
  {
    title: "Dashboard",
    body: "Schedule one email or a CSV of up to 1,000 recipients, spaced out over minutes or hours, from your browser.",
    code: `To:   list.csv (840 recipients)
When: Monday 9:00
Pace: 1 minute apart`,
  },
];

const VISIBILITY = [
  ["Every attempt, on the record", "Each email keeps a timeline: who scheduled it, every send attempt, and exactly what the provider replied."],
  ["Failures you can act on", "Permanent rejections stop immediately; temporary ones retry with backoff. What fails for good waits in one list with a resend button."],
  ["Limits that delay, not drop", "Set an hourly cap per provider. Emails over the cap wait for the next free slot instead of failing."],
  ["Bring any provider", "SMTP or Resend today, with credentials encrypted at rest. Switch providers without touching your app."],
];

export default function Home() {
  return (
    <div className="bg-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <a href={GITHUB} className="rounded-md px-3 py-2 text-ink-soft hover:text-ink">
            GitHub
          </a>
          <Link href="/login" className="rounded-md px-3 py-2 text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <ButtonLink href="/signup" size="sm" className="ml-2">
            Start free
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <h1 className="text-[clamp(2.4rem,5.2vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
              Schedule email from your app, your terminal, or your AI agent.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-soft">
              Mailclock is an open-source email scheduler. It queues in Postgres, sends through your own SMTP or Resend
              account, and shows you what went out, what&apos;s waiting, and what failed.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                Start free
              </ButtonLink>
              <ButtonLink href={GITHUB} variant="secondary" size="lg">
                Self-host from GitHub
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-faint">MIT licensed. Postgres is the only thing you need to run it.</p>
          </div>
          <AgentDemo />
        </section>

        <section className="border-t border-line bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="max-w-xl text-3xl font-semibold">One queue, three ways in</h2>
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {WAYS.map((w) => (
                <div key={w.title}>
                  <h3 className="text-lg font-semibold">{w.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{w.body}</p>
                  <pre className="mt-5 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-[12.5px] leading-relaxed text-[#e6ebf1]">
                    {w.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-xl text-3xl font-semibold">Know what happened to every email</h2>
          <p className="mt-3 max-w-xl text-lg text-ink-soft">
            Built for the person who gets asked &ldquo;did that email go out?&rdquo; and wants to answer in five seconds.
          </p>
          <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {VISIBILITY.map(([t, b]) => (
              <div key={t} className="border-l-2 border-cobalt pl-5">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1.5 leading-relaxed text-ink-soft">{b}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-line bg-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold">Run it on your own servers</h2>
              <p className="mt-3 leading-relaxed text-[#b8c3cf]">
                Clone the repo and start it with Docker. Your emails, credentials, and logs never leave your infrastructure.
              </p>
              <pre className="mt-6 overflow-x-auto rounded-lg border border-white/10 p-4 font-mono text-[13px] leading-relaxed text-[#e6ebf1]">
                {`git clone ${GITHUB}
cd mailclock && cp .env.example .env
# set the secrets in .env (see the README)
docker compose --profile app up -d --build`}
              </pre>
            </div>
            <div>
              <h2 className="text-3xl font-semibold">Or use the hosted version</h2>
              <p className="mt-3 leading-relaxed text-[#b8c3cf]">
                Sign up, connect your provider, and create an API key. Your first email can be scheduled in about two minutes.
              </p>
              <ButtonLink href="/signup" size="lg" className="mt-6 bg-white text-ink hover:bg-paper">
                Create a free account
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-faint">
        <Logo />
        <p>
          Open source under the MIT License.{" "}
          <a href={GITHUB} className="text-ink-soft underline underline-offset-2 hover:text-ink">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
