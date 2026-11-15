import { isPublicAuthPath, signInRedirectPath } from "@/lib/auth/public-routes";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_QUERY_PARAM,
  isValidReferralCode,
} from "@/lib/referral/constants";
import { getSessionCookie } from "better-auth/cookies";
import { getMarketingUrl } from "lib/marketing-url";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE_EXTENSIONS = [
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".ico",
  ".webp",
  ".md",
  ".txt",
  ".html",
  ".md",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
];

function isPublicStaticAsset(pathname: string): boolean {
  // API paths must never bypass authentication based only on their suffix.
  return (
    !pathname.startsWith("/api/") &&
    PUBLIC_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension))
  );
}

/**
 * The marketing pages moved to the standalone apps/marketing site
 * (voidagent.space). The app domain must never serve or index them: every
 * former public URL 308s to its marketing URL, preserving the query string.
 * Checked BEFORE every other gate (including the static-extension bypass —
 * /design.md and /llms.txt end in file extensions and would otherwise 404).
 */
const MARKETING_REDIRECTS = new Map<string, string>([
  ["/landing", "/"],
  ["/updates", "/index"],
  ["/pricing", "/pricing"],
  ["/about", "/about"],
  ["/docs", "/docs"],
  ["/docs/mcp", "/docs/mcp"],
  ["/contact", "/contact"],
  ["/contact-sales", "/contact-sales"],
  ["/vs/manus", "/vs/manus"],
  ["/index", "/index"],
  ["/branding", "/branding"],
  ["/privacy-policy", "/privacy-policy"],
  ["/terms-of-service", "/terms-of-service"],
  ["/cookies-policy", "/cookies-policy"],
  ["/refund-policy", "/refund-policy"],
  ["/grievance-redressal", "/grievance-redressal"],
  ["/llms.txt", "/llms.txt"],
  ["/design.md", "/design.md"],
]);

const PUBLIC_DESTINATION_PAGES = new Set([
  "/manifest.json",
  "/manifest.webmanifest",
  "/sw.js",
  "/marketplace/mcp",
  "/plans",
  "/gallery/agents",
  "/team-invitations/accept",
]);

function isPublicDestinationPage(pathname: string): boolean {
  return (
    PUBLIC_DESTINATION_PAGES.has(pathname) ||
    pathname.startsWith("/gallery/agents/") ||
    pathname.startsWith("/marketplace/mcp/")
  );
}

function isTokenAuthenticatedPublicEndpoint(pathname: string): boolean {
  return (
    pathname === "/api/mcp/server" ||
    pathname === "/.well-known/mcp.json" ||
    pathname === "/api/navigator-mcp" ||
    pathname === "/api/_boot" ||
    pathname === "/api/embed/session" ||
    pathname.startsWith("/api/inbound/") ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/voice/devices/register" ||
    pathname === "/api/voice/devices/complete-registration" ||
    pathname === "/api/voice/devices/ws" ||
    pathname === "/api/voice/transcript" ||
    pathname === "/api/voice/audio-command" ||
    pathname === "/api/voice/xiaozhi/ota" ||
    pathname === "/api/voice/xiaozhi/ota/activate" ||
    pathname === "/api/voice/xiaozhi/activate"
  );
}

const BOOT_VISIT_COOKIE = "__boot_visit";
const BOOT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BootDocumentContext = {
  documentId: string;
  visitId: string;
  isNewVisit: boolean;
  requestHeaders: Headers;
};

function createBootDocumentContext(
  request: NextRequest,
): BootDocumentContext | null {
  if (
    process.env.BOOT_DIAGNOSTICS !== "1" ||
    request.headers.get("sec-fetch-dest") !== "document"
  ) {
    return null;
  }

  const existingVisitId = request.cookies.get(BOOT_VISIT_COOKIE)?.value;
  const isValidVisitId =
    existingVisitId !== undefined && BOOT_ID_PATTERN.test(existingVisitId);
  const visitId = isValidVisitId ? existingVisitId : crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-boot-visit-id", visitId);
  requestHeaders.set("x-boot-document-id", documentId);

  return {
    documentId,
    visitId,
    isNewVisit: !isValidVisitId,
    requestHeaders,
  };
}

function safeReferrer(value: string | null): string {
  if (!value) return "(none)";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "(invalid)";
  }
}

function finishDocumentResponse(
  response: NextResponse,
  request: NextRequest,
  boot: BootDocumentContext | null,
  outcome: "next" | "redirect",
  sessionCookiePresent: boolean | null,
  location?: string,
) {
  if (!boot) return response;

  response.cookies.set(BOOT_VISIT_COOKIE, boot.visitId, {
    httpOnly: true,
    maxAge: 30 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("x-boot-document-id", boot.documentId);
  response.headers.set("x-boot-visit-id", boot.visitId);

  console.info("[boot] document", {
    event: "document",
    at: new Date().toISOString(),
    visitId: boot.visitId,
    documentId: boot.documentId,
    isNewVisit: boot.isNewVisit,
    pathname: request.nextUrl.pathname,
    outcome,
    location: location ?? null,
    sessionCookiePresent,
    secFetchSite: request.headers.get("sec-fetch-site") ?? "(none)",
    secFetchMode: request.headers.get("sec-fetch-mode") ?? "(none)",
    secFetchUser: request.headers.get("sec-fetch-user") ?? "(none)",
    purpose:
      request.headers.get("purpose") ??
      request.headers.get("sec-purpose") ??
      "(none)",
    cacheControl: request.headers.get("cache-control") ?? "(none)",
    serviceWorkerNavigationPreload:
      request.headers.get("service-worker-navigation-preload") ?? "(none)",
    referer: safeReferrer(request.headers.get("referer")),
    mobile: request.headers.get("sec-ch-ua-mobile") ?? "(unknown)",
    platform: request.headers.get("sec-ch-ua-platform") ?? "(unknown)",
    userAgent: request.headers.get("user-agent")?.slice(0, 160) ?? "(none)",
    vercelRequestId: request.headers.get("x-vercel-id") ?? "(none)",
  });

  return response;
}

/**
 * Persist a `?ref=` referral code so it survives sign-up.
 *
 * It cannot simply ride along in the URL: `signInRedirectPath` returns a bare
 * "/sign-in" for the landing page (`pathname === "/"`), dropping the query
 * string — and that is exactly where referral links point. `sameSite: "lax"`
 * keeps the cookie attached through the OAuth round trip, which returns as a
 * top-level GET to our own origin.
 *
 * Last click wins. The code is not signed: Autumn validates it, so a forged one
 * is worthless and a borrowed valid one is indistinguishable from clicking that
 * person's link anyway.
 */
function captureReferralCode(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const code = request.nextUrl.searchParams.get(REFERRAL_QUERY_PARAM);
  if (!isValidReferralCode(code)) return response;

  response.cookies.set(REFERRAL_COOKIE, code as string, {
    httpOnly: true,
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const boot = createBootDocumentContext(request);
  const next = (sessionCookiePresent: boolean | null = null) =>
    captureReferralCode(
      finishDocumentResponse(
        NextResponse.next(
          boot ? { request: { headers: boot.requestHeaders } } : undefined,
        ),
        request,
        boot,
        "next",
        sessionCookiePresent,
      ),
      request,
    );
  const redirect = (
    destination: string,
    sessionCookiePresent: boolean | null,
    status: 307 | 308 = 307,
  ) =>
    captureReferralCode(
      finishDocumentResponse(
        NextResponse.redirect(new URL(destination, request.url), status),
        request,
        boot,
        "redirect",
        sessionCookiePresent,
        destination,
      ),
      request,
    );

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Former marketing URLs → the standalone marketing site. Runs for anonymous
  // AND signed-in traffic: the routes no longer exist on this origin. 308 so
  // search engines transfer the old URLs' history to the new domain.
  const marketingPath = MARKETING_REDIRECTS.get(pathname);
  if (marketingPath !== undefined) {
    const target = new URL(marketingPath, getMarketingUrl());
    target.search = request.nextUrl.search;
    return redirect(target.toString(), null, 308);
  }

  // Embed pages/scripts and public files are intentionally reachable without
  // a session. Session creation and public APIs still enforce their own token
  // and ownership checks in the route handlers.
  if (
    isPublicDestinationPage(pathname) ||
    pathname === "/embed.js" ||
    pathname === "/embed" ||
    pathname.startsWith("/embed/") ||
    isPublicStaticAsset(pathname)
  ) {
    return next();
  }

  // The Sentry tunnel is a fixed same-origin rewrite, never a user-selected
  // proxy target. It must pass middleware only while server reporting is on.
  if (
    pathname === "/monitoring" &&
    process.env.SENTRY_DSN &&
    process.env.SENTRY_ENABLED !== "false"
  ) {
    return next();
  }

  // Allow scheduled task requests through when the shared secret is configured
  // and valid. The route handler performs its own user-level validation.
  const scheduledTaskSecret = process.env.SCHEDULED_TASK_SECRET;
  if (
    scheduledTaskSecret &&
    request.headers.get("X-Scheduled-Task-Auth") === scheduledTaskSecret
  ) {
    return next();
  }

  // Token-authenticated APIs enforce their own signed/scoped/device credentials.
  // Do not broaden this to all API routes: session-backed APIs stay gated here.
  if (isTokenAuthenticatedPublicEndpoint(pathname)) {
    return next();
  }

  // CORS preflights carry no credentials and are harmless: the route's own
  // OPTIONS handler answers them (and only for the allowlisted marketing
  // origin — lib/security/cors.ts). Without this the cookie gate below would
  // 307 the preflight and the browser would block the actual request.
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return next();
  }

  // The marketing site's cross-origin checkout POST must reach the route
  // handler so an unauthenticated visitor gets the handler's structured 401
  // (+ CORS headers) instead of this middleware's redirect to /sign-in on an
  // API path. Origin is not a security boundary — the handler keeps its full
  // session, allowlist and rate-limit checks; this only fixes the redirect UX.
  if (
    pathname === "/api/payments/dodo/checkout" &&
    request.headers.get("origin") === getMarketingUrl()
  ) {
    return next();
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: process.env.AUTH_COOKIE_PREFIX || "better-auth",
  });
  const sessionCookiePresent = Boolean(sessionCookie);

  // Include public auth pages in the matcher so their document requests get
  // their own document ID and can be paired with the redirect that led there.
  if (isPublicAuthPath(pathname)) {
    return next(sessionCookiePresent);
  }

  if (!sessionCookie) {
    // The marketing homepage moved to the standalone marketing site;
    // anonymous visitors to the bare root continue there. 307, not 308:
    // signed-in users still get the chat workspace at "/" below, so this
    // redirect must never be cached by a browser.
    if (pathname === "/") {
      return redirect(`${getMarketingUrl()}/`, false);
    }
    // Carry the requested page as `callbackUrl` instead of dropping it. An
    // invited user opening /accept-invitation/:id signs in (or signs up) and
    // lands back on the invitation, which is why that route needs no
    // exemption of its own.
    return redirect(
      signInRedirectPath(pathname, request.nextUrl.search),
      false,
    );
  }

  // The onboarding gate lives in the (chat) layout now. The old cookie-based
  // middleware gate bounced every NEW device through /onboarding →
  // /api/onboarding/complete → / (three redirects), which users saw as the
  // app loading twice on first open.
  return next(true);
}

export const config = {
  matcher: [
    // `p` is the published-page surface: readable by anyone holding the slug,
    // so it must not bounce anonymous visitors to /sign-in. The lookahead
    // anchors at the path start, so this exempts only top-level /p/* — every
    // /api/* route, including the publish and revoke endpoints, stays guarded.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|api/inngest|export|p/).*)",
  ],
};
