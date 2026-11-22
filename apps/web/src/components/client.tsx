"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

/**
 * Re-fetches server components while the tab is visible: immediately when it becomes visible
 * again, then every `intervalMs`. Polling stops while hidden, and a tick is skipped while the
 * previous refresh is still in flight, so slow responses never stack up.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (!pendingRef.current) startTransition(() => router.refresh());
    };
    const start = () => {
      timer ??= setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);
  return null;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-muted-wash hover:text-ink"
    >
      {copied ? <Check className="size-3.5 text-sent" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function NavLink({ href, children, badge }: { href: string; children: ReactNode; badge?: number }) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm",
        active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
      {!!badge && (
        <span className="rounded-full bg-failed px-1.5 text-[11px] font-semibold leading-[18px] text-white">{badge}</span>
      )}
    </Link>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-ink-soft hover:text-ink"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );
}

/** Renders a timestamp in the viewer's timezone. The server pass renders UTC. */
export function LocalTime({ iso, withSeconds = false }: { iso: string; withSeconds?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const opts: Intl.DateTimeFormatOptions = withSeconds
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }
      : { dateStyle: "medium", timeStyle: "short" };
    setText(new Intl.DateTimeFormat(undefined, opts).format(new Date(iso)));
  }, [iso, withSeconds]);
  return <time dateTime={iso}>{text ?? `${iso.slice(0, 16).replace("T", " ")} UTC`}</time>;
}
