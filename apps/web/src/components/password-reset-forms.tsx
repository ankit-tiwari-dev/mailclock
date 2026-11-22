"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="space-y-4" role="status">
        {/* Same message whether or not an account exists, so this page cannot be used to test addresses. */}
        <p className="text-[15px]">
          If <strong>{sentTo}</strong> has a Mailclock account, a link to reset the password is on its way. It works for one hour.
        </p>
        <Link href="/login" className="text-sm font-medium text-cobalt hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email"));
        setError(null);
        start(async () => {
          const res = await authClient.requestPasswordReset(email);
          if (res.error) return setError(res.error.message);
          setSentTo(email);
        });
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!token || invalid) {
    return (
      <div className="space-y-4">
        <Notice tone="error">This reset link is invalid or has expired.</Notice>
        <Link href="/forgot-password" className="text-sm font-medium text-cobalt hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password"));
        if (password !== String(fd.get("confirm"))) return setError("The two passwords do not match");
        setError(null);
        start(async () => {
          const res = await authClient.resetPassword(token, password);
          if (res.error) return setError(res.error.message);
          router.push("/login?reset=1");
        });
      }}
    >
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Repeat the new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
