"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function AuthForm({ mode, social }: { mode: "login" | "signup"; social: ("github" | "google")[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-[15px]">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish {mode === "signup" ? "creating your account" : "signing in"}.
        </p>
        <p className="text-sm text-ink-soft">No email after a few minutes? Check your spam folder, or sign in again to get a new link.</p>
        <Link href="/login" className="text-sm font-medium text-cobalt hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {social.length > 0 && (
        <>
          <div className="grid gap-2">
            {social.map((p) => (
              <Button
                key={p}
                variant="secondary"
                size="lg"
                type="button"
                onClick={async () => {
                  const res = await authClient.signInSocial(p, "/dashboard");
                  if (res.error) setError(res.error.message);
                }}
              >
                Continue with {p === "github" ? "GitHub" : "Google"}
              </Button>
            ))}
          </div>
          <p className="text-center text-[13px] text-ink-faint">or with email</p>
        </>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const email = String(fd.get("email"));
          const password = String(fd.get("password"));
          setError(null);
          start(async () => {
            const res =
              mode === "signup"
                ? await authClient.signUpEmail(String(fd.get("name") || email.split("@")[0]), email, password)
                : await authClient.signInEmail(email, password);
            if (res.error) {
              // Signing in with an unconfirmed address re-sends the link (Better Auth sendOnSignIn).
              if (res.error.code === "EMAIL_NOT_VERIFIED") return setSentTo(email);
              return setError(res.error.message);
            }
            if ("verify" in res && res.verify) return setSentTo(email);
            router.push("/dashboard");
            router.refresh();
          });
        }}
      >
        {mode === "signup" && (
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={
            mode === "signup" ? (
              "At least 8 characters."
            ) : (
              <Link href="/forgot-password" className="text-cobalt hover:underline">
                Forgot your password?
              </Link>
            )
          }
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-ink-soft">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-cobalt hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Mailclock?{" "}
            <Link href="/signup" className="font-medium text-cobalt hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
