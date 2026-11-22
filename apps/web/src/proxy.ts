import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce Content-Security-Policy for pages (Next 16 guide: "Adding a nonce with Proxy").
 * Only scripts and styles carrying this request's nonce run, so injected markup cannot execute.
 * The other security headers (HSTS, nosniff, …) are set for every route in next.config.ts.
 *
 * Email previews render untrusted HTML in a sandboxed iframe; img-src deliberately excludes remote
 * hosts, so opening an email in the dashboard never fires its tracking pixels.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const servedOverHttps =
    process.env.BETTER_AUTH_URL?.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React style={{…}} attributes (timeline bar heights); attribute styles cannot run code.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when the app is served over HTTPS: on a plain-HTTP self-host (http://<lan-ip>:3000)
    // this directive would force every asset to https:// and break the page.
    ...(!isDev && servedOverHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes return JSON, static assets need no CSP.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
