"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/dashboard/actions";
import { CopyButton } from "@/components/client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function CreateKeyForm() {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [quota, setQuota] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (created) {
    return (
      <div className="space-y-3">
        <Notice tone="success">Copy this key now. Mailclock only stores a hash, so you won&apos;t see it again.</Notice>
        <div className="flex items-center gap-2 rounded-md border border-line bg-paper p-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{created}</code>
          <CopyButton value={created} />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createApiKeyAction({ name, readOnly, dailyQuota: quota ? Number(quota) : undefined });
          if (!res.ok) return setError(res.error);
          setCreated(res.data!.key);
          setName("");
          setQuota("");
        });
      }}
    >
      <Field label="Name" htmlFor="key-name" hint="Where it's used, e.g. “Production backend” or “Claude Desktop”.">
        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </Field>
      <Field label="Daily limit" htmlFor="key-quota" hint="Optional. Most emails this key may schedule per day (UTC).">
        <Input id="key-quota" type="number" min={1} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="No limit" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="mt-0.5 accent-cobalt" />
        <span>
          Read only
          <span className="block text-[13px] text-ink-faint">Can see emails and stats, but cannot schedule or cancel.</span>
        </span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}

export function RevokeKeyButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`Revoke "${name}"? Anything using it will stop working immediately.`)) start(async () => void (await revokeApiKeyAction(id)));
      }}
    >
      Revoke
    </Button>
  );
}
