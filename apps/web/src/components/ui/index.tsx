import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// ─── Buttons ─────────────────────────────────────────────────────────────────

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const buttonVariants = {
  primary: "bg-cobalt text-white hover:bg-cobalt-dark",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-paper",
  ghost: "text-ink-soft hover:bg-muted-wash hover:text-ink",
  danger: "border border-line-strong bg-surface text-failed hover:bg-failed-wash",
} as const;

const buttonSizes = { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-5 text-[15px]" } as const;

type ButtonStyle = { variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes };

export const buttonClass = ({ variant = "primary", size = "md" }: ButtonStyle = {}, extra?: string) =>
  cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra);

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}

// ─── Form controls ───────────────────────────────────────────────────────────

const controlClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, "h-9 pr-8", className)} {...props} />;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] text-ink-faint">{hint}</p>}
    </div>
  );
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-cobalt/30 bg-cobalt-wash text-ink",
    error: "border-failed/30 bg-failed-wash text-failed",
    success: "border-sent/30 bg-sent-wash text-sent",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-3.5 py-2.5 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("rounded bg-muted-wash px-1.5 py-0.5 font-mono text-[0.85em]", className)}>{children}</code>;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export const STATUS_META = {
  SCHEDULED: { label: "Scheduled", className: "bg-cobalt-wash text-cobalt", dot: "bg-cobalt" },
  SENDING: { label: "Sending", className: "bg-cobalt-wash text-cobalt", dot: "bg-cobalt animate-pulse" },
  RETRYING: { label: "Retrying", className: "bg-retry-wash text-retry", dot: "bg-retry" },
  SENT: { label: "Sent", className: "bg-sent-wash text-sent", dot: "bg-sent" },
  FAILED: { label: "Failed", className: "bg-failed-wash text-failed", dot: "bg-failed" },
  CANCELLED: { label: "Cancelled", className: "bg-muted-wash text-ink-soft", dot: "bg-ink-faint" },
} as const;

export type Status = keyof typeof STATUS_META;

export function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", meta.className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
