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

  for (const path of SIGNED_IN) await scan(path);
} catch (err) {
  console.error(`a11y-scan: ${err instanceof Error ? err.message : err}`);
  await browser.close();
  process.exit(2);
}
await browser.close();
process.stdout.write(JSON.stringify(results));
