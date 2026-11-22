"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { scheduleFromDashboard } from "@/app/dashboard/actions";
import { toLocalInputValue } from "@/components/email-actions";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";

type ProviderOption = { id: string; name: string; type: string; defaultFrom: string | null; isDefault: boolean };

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function parseRecipients(raw: string) {
  const tokens = raw.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(tokens)];
  return { valid: unique.filter((t) => EMAIL_RE.test(t)), invalid: unique.filter((t) => !EMAIL_RE.test(t)) };
}

export function ComposeForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const defaultProvider = providers.find((p) => p.isDefault) ?? providers[0]!;

  const [to, setTo] = useState("");
  const [providerId, setProviderId] = useState(defaultProvider.id);
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<"text" | "html">("text");
  const [body, setBody] = useState("");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
  const [stagger, setStagger] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [csvNote, setCsvNote] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === providerId);
  const { valid, invalid } = useMemo(() => parseRecipients(to), [to]);
  const staggerSeconds = Number(stagger) || 0;
  const lastSendMinutes = Math.round(((valid.length - 1) * staggerSeconds) / 60);

  async function importCsv(file: File) {
    // Loaded only when someone actually imports a CSV.
    const { default: Papa } = await import("papaparse");
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const found = res.data.flat().map((c) => String(c).trim()).filter((c) => EMAIL_RE.test(c));
        setTo((prev) => [prev.trim(), ...found].filter(Boolean).join("\n"));
        setCsvNote(`Added ${found.length} address${found.length === 1 ? "" : "es"} from ${file.name}`);
      },
      error: (err) => setError(`Could not read ${file.name}: ${err.message}`),
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (valid.length === 0) return setError("Add at least one valid recipient");
    if (invalid.length) return setError(`Fix or remove these addresses: ${invalid.slice(0, 5).join(", ")}`);
    start(async () => {
      const res = await scheduleFromDashboard({
        to: valid,
        from: from.trim() || undefined,
        subject,
        body,
        format,
        sendAt: timing === "later" ? new Date(sendAt).toISOString() : undefined,
        staggerSeconds,
        providerId,
      });
      if (!res.ok) return setError(res.error);
      router.push(valid.length === 1 ? "/dashboard/emails" : "/dashboard");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel className="space-y-5 p-5">
        <Field
          label="To"
          htmlFor="to"
          hint={
            <span className="flex flex-wrap items-center gap-x-3">
              <span>
                {valid.length} recipient{valid.length === 1 ? "" : "s"}
                {invalid.length > 0 && <span className="text-failed">, {invalid.length} invalid</span>}
              </span>
              <label className="cursor-pointer text-cobalt hover:underline">
                Import a CSV
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              </label>
              {csvNote && <span>{csvNote}</span>}
            </span>
          }
        >
          <Textarea id="to" rows={3} value={to} onChange={(e) => setTo(e.target.value)} placeholder="ada@example.com, grace@example.com" required />
        </Field>

        <Field label="Subject" htmlFor="subject">
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={998} />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="body" className="text-sm font-medium">
              Message
            </label>
            <div role="radiogroup" aria-label="Message format" className="flex rounded-md border border-line p-0.5 text-[13px]">
              {(["text", "html"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={format === f}
                  onClick={() => setFormat(f)}
                  className={cn("rounded px-2.5 py-0.5", format === f ? "bg-ink text-white" : "text-ink-soft")}
                >
                  {f === "text" ? "Plain text" : "HTML"}
                </button>
              ))}
            </div>
          </div>
          <Textarea id="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} required className={cn(format === "html" && "font-mono text-[13px]")} />
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel className="space-y-5 p-5">
          <fieldset>
            <legend className="text-sm font-medium">When</legend>
            <div className="mt-2 space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="timing" checked={timing === "now"} onChange={() => setTiming("now")} className="accent-cobalt" />
                As soon as possible
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="timing" checked={timing === "later"} onChange={() => setTiming("later")} className="accent-cobalt" />
                At a specific time
              </label>
            </div>
            {timing === "later" && (
              <div className="mt-3">
                <label htmlFor="send-at" className="sr-only">
                  Send time
                </label>
                <Input id="send-at" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} required />
                <p className="mt-1 text-[13px] text-ink-faint">In your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</p>
              </div>
            )}
          </fieldset>

          {valid.length > 1 && (
            <Field
              label="Space out sends"
              htmlFor="stagger"
              hint={staggerSeconds > 0 ? `The last email goes about ${lastSendMinutes} minute${lastSendMinutes === 1 ? "" : "s"} after the first.` : "All emails go at once, within your provider's rate limit."}
            >
              <Select id="stagger" value={stagger} onChange={(e) => setStagger(e.target.value)}>
                <option value="0">Send all together</option>
                <option value="10">10 seconds apart</option>
                <option value="60">1 minute apart</option>
                <option value="300">5 minutes apart</option>
                <option value="900">15 minutes apart</option>
              </Select>
            </Field>
          )}
        </Panel>

        <Panel className="space-y-5 p-5">
          <Field label="Send with" htmlFor="provider">
            <Select id="provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="from" hint={provider?.defaultFrom ? `Leave empty to use ${provider.defaultFrom}` : "This provider has no default; enter an address."}>
            <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={provider?.defaultFrom ?? "Name <you@yourdomain.com>"} required={!provider?.defaultFrom} />
          </Field>
        </Panel>

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "Scheduling…"
            : timing === "now"
              ? `Send ${valid.length > 1 ? `${valid.length} emails` : "email"}`
              : `Schedule ${valid.length > 1 ? `${valid.length} emails` : "email"}`}
        </Button>
      </div>
    </form>
  );
}
