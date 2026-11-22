"use client";

import { useState, useTransition } from "react";
import { createProviderAction, deleteProviderAction, setDefaultProviderAction } from "@/app/dashboard/actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

type Type = "RESEND" | "SMTP" | "MOCK";

const DESCRIPTIONS: Record<Type, string> = {
  RESEND: "Send through Resend's API. Works on hosts that block SMTP ports.",
  SMTP: "Any SMTP server: Gmail, Postmark, SES, Mailgun, your own.",
  MOCK: "Pretends to send. For local development and demos.",
};

export function AddProviderForm() {
  const [pending, start] = useTransition();
  const [type, setType] = useState<Type>("RESEND");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const get = (k: string) => String(fd.get(k) ?? "").trim();
        const config =
          type === "RESEND"
            ? { apiKey: get("apiKey") }
            : type === "SMTP"
              ? { host: get("host"), port: Number(get("port") || 587), tls: get("tls") || "starttls", user: get("user") || undefined, pass: get("pass") || undefined }
              : {};
        setError(null);
        setDone(false);
        start(async () => {
          const res = await createProviderAction({
            name: get("name"),
            type,
            config,
            defaultFrom: get("defaultFrom") || undefined,
            ratePerHour: Number(get("ratePerHour")) || undefined,
            verify: fd.get("verify") === "on",
          });
          if (!res.ok) return setError(res.error);
          form.reset();
          setDone(true);
        });
      }}
    >
      <Field label="Type" htmlFor="type" hint={DESCRIPTIONS[type]}>
        <Select id="type" value={type} onChange={(e) => setType(e.target.value as Type)}>
          <option value="RESEND">Resend</option>
          <option value="SMTP">SMTP</option>
          <option value="MOCK">Mock (no real sending)</option>
        </Select>
      </Field>
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" placeholder={type === "SMTP" ? "Postmark SMTP" : type === "RESEND" ? "Resend production" : "Mock"} />
      </Field>

      {type === "RESEND" && (
        <Field label="API key" htmlFor="apiKey" hint="Starts with re_. Needs sending access.">
          <Input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="re_…" />
        </Field>
      )}
      {type === "SMTP" && (
        <>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="Host" htmlFor="host">
              <Input id="host" name="host" required placeholder="smtp.postmarkapp.com" />
            </Field>
            <Field label="Port" htmlFor="port">
              <Input id="port" name="port" type="number" defaultValue={587} />
            </Field>
          </div>
          <Field label="Username" htmlFor="user">
            <Input id="user" name="user" autoComplete="off" />
          </Field>
          <Field label="Password" htmlFor="pass">
            <Input id="pass" name="pass" type="password" autoComplete="off" />
          </Field>
          <Field label="Encryption" htmlFor="tls" hint="STARTTLS refuses to send if the server cannot encrypt. Turning encryption off is only allowed for a local relay.">
            <Select id="tls" name="tls" defaultValue="starttls">
              <option value="starttls">STARTTLS, required (port 587)</option>
              <option value="implicit">TLS from the start (port 465)</option>
              <option value="none">None, local relay only (e.g. Mailpit)</option>
            </Select>
          </Field>
        </>
      )}

      <Field label="Default From address" htmlFor="defaultFrom" hint="Used when an email doesn't set its own From.">
        <Input id="defaultFrom" name="defaultFrom" placeholder="Acme <hello@acme.com>" required={type !== "MOCK"} />
      </Field>
      <Field label="Hourly limit" htmlFor="ratePerHour" hint="Optional. Extra emails wait for the next free slot instead of failing.">
        <Input id="ratePerHour" name="ratePerHour" type="number" min={1} placeholder="No limit" />
      </Field>
      {type !== "MOCK" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="verify" defaultChecked className="accent-cobalt" /> Test the connection before saving
        </label>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">Provider added</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Add provider"}
      </Button>
    </form>
  );
}

export function ProviderRowActions({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {!isDefault && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => void (await setDefaultProviderAction(id)))}>
            Make default
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Remove "${name}"? Its stored credentials are deleted.`)) return;
            start(async () => {
              const res = await deleteProviderAction(id);
              setError(res.ok ? null : res.error);
            });
          }}
        >
          Remove
        </Button>
      </div>
      {error && <p className="max-w-xs text-right text-[13px] text-failed">{error}</p>}
    </div>
  );
}
