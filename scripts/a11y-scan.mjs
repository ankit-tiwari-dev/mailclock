#!/usr/bin/env node
// a11y-scan.mjs — runs axe-core (WCAG 2.0/2.1 A + AA) against every public and signed-in page and
// writes axe's per-page results as a JSON array, the same shape the axe CLI produces, so
// scripts/quality-gate.mjs can apply the CONSTRAINTS.md threshold (zero critical or serious).
//
// The axe CLI cannot sign in, and most of Mailclock's UI is behind a session, so this drives
// axe-core through Playwright instead. Same engine, same rules, same report format.
//
// Usage: PREVIEW_URL=http://localhost:3000 node scripts/a11y-scan.mjs > axe-results.json
// Env:   BROWSER_CHANNEL=msedge|chrome to use an installed browser instead of Playwright's Chromium.
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

// A crash must never read as a violation (1) or a pass (0): it means the check did not run.
process.on("uncaughtException", (e) => { console.error(e); process.exit(2); });
process.on("unhandledRejection", (e) => { console.error(e); process.exit(2); });


const base = (process.env.PREVIEW_URL ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("a11y-scan: set PREVIEW_URL to the running app, e.g. http://localhost:3000");
  process.exit(2);
}

const PUBLIC = ["/", "/login", "/signup"];
const SIGNED_IN = [
  "/dashboard",
  "/dashboard/emails",
  "/dashboard/failed",
  "/dashboard/compose",
  "/dashboard/providers",
  "/dashboard/keys",
  "/dashboard/connect",
];

const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const scan = async (path) => {
    const res = await page.goto(base + path, { waitUntil: "networkidle" });
    // An error page can look like a clean scan; refuse to report one.
    if (!res || res.status() >= 400) throw new Error(`${path} returned ${res?.status() ?? "no response"}`);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    results.push({ ...r, url: page.url() });
    console.error(`a11y-scan: ${path} — ${r.violations.length} violation(s)`);
  };

  for (const path of PUBLIC) await scan(path);

  // Throwaway account: sign-up goes through the real UI so the scan sees the real session.
  const email = `a11y-${Date.now()}@mailclock.test`;
  await page.goto(`${base}/signup`);
  await page.fill("#name", "Accessibility Scan");
  await page.fill("#email", email);
  await page.fill("#password", "a11y-scan-password");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // An empty account hides most of the UI (status badges, tables, the timeline). Put an email in
  // every status first. The account's Mock provider sends nothing; bounce@ fails permanently and
  // flaky@ fails transiently. (A first run that scanned only empty pages missed two badge-contrast
  // failures, 2026-11-22.)
  const compose = async (to, later) => {
    await page.goto(`${base}/dashboard/compose`);
    await page.fill("#to", to);
    await page.fill("#subject", `Scan ${to}`);
    await page.fill("#body", "Accessibility scan");
    if (later) await page.check("input[name=timing] >> nth=1");
    await page.click("form:has(#to) button[type=submit]");
    await page.waitForURL((u) => !u.pathname.endsWith("/compose"), { timeout: 15_000 });
  };
  await compose("ada@example.com, bounce@example.com, flaky@example.com", false);
  await compose("later@example.com", true);
  await compose("cancel@example.com", true);

  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("set CRON_SECRET (the app's value) so the scan can dispatch emails into sent/failed/retrying");
  const dispatched = await page.request.get(`${base}/api/cron/dispatch`, { headers: { Authorization: `Bearer ${secret}` } });
  if (!dispatched.ok()) throw new Error(`cron dispatch returned ${dispatched.status()}`);

  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/dashboard/emails?status=SCHEDULED`);
  await page.locator("a", { hasText: "Scan cancel@example.com" }).click();
  await page.getByRole("button", { name: "Cancel email" }).click();
  await page.getByText("Email cancelled").waitFor({ timeout: 10_000 });
  const detailPath = new URL(page.url()).pathname;

  for (const path of [...SIGNED_IN, "/dashboard/emails?status=FAILED", detailPath]) await scan(path);
} catch (err) {
  console.error(`a11y-scan: ${err instanceof Error ? err.message : err}`);
  await browser.close();
  process.exit(2);
}
await browser.close();
process.stdout.write(JSON.stringify(results));
