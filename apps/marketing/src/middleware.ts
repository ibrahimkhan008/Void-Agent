import { type NextRequest, NextResponse } from "next/server";

// Canonical apex of the marketing site. The env value is normalized to its
// hostname so both the bare origin and a full URL work.
const APEX_HOSTNAME = (() => {
  const raw = process.env.NEXT_PUBLIC_MARKETING_URL;
  if (!raw?.trim()) return "voidagent.space";
  try {
    return new URL(raw.trim()).hostname;
  } catch {
    return "voidagent.space";
  }
})();

/**
 * Marketing middleware, two jobs:
 *
 * 1. www → apex. Production serves the site through Cloudflare Tunnel
 *    ingress for both hostnames; this redirect keeps one canonical host for
 *    SEO and cookies. Dev (localhost:3001) passes straight through.
 *
 * 2. `/` serves the landing page via a rewrite (URL stays "/"). The landing
 *    lives at /landing and NOT at a root page.tsx: an app router root page
 *    collides with the changelog route folder `index/` ("Expected
 *    clientReferenceManifest" prerender bug — "/" and "/index" normalize to
 *    the same route key). This is also exactly how the app domain served the
 *    homepage before the extraction, so it preserves the old behavior.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();

  if (host === `www.${APEX_HOSTNAME}`) {
    const url = new URL(request.url);
    url.hostname = APEX_HOSTNAME;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/landing", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
