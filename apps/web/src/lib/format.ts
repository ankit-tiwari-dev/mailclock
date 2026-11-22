const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/** "in 5 minutes", "2 hours ago" */
export function relativeTime(date: Date | string, now = Date.now()): string {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  if (Math.abs(seconds) < 30) return "just now";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function dateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export function recipients(to: string[]): string {
  if (to.length <= 1) return to[0] ?? "";
  return `${to[0]} +${to.length - 1}`;
}
