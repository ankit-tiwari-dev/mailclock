/** Mailclock mark: an envelope whose flap doubles as clock hands. */
export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="1.5" y="5.5" width="25" height="17" rx="3" fill="var(--color-ink)" />
        <path d="M14 14 L14 8.5" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 14 L18.5 16.5" stroke="#7d97ff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="14" cy="14" r="1.6" fill="var(--color-paper)" />
      </svg>
      {withWordmark && <span className="text-[17px] font-semibold tracking-[-0.03em]">Mailclock</span>}
    </span>
  );
}
