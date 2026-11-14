import { getMarketingUrl } from "lib/marketing-url";

/**
 * CORS for the marketing site → app API boundary (currently the only
 * cross-origin consumer is the pricing page's Dodo checkout POST).
 *
 * Fail-closed and exact-origin: the browser gets credential-allowing CORS
 * headers ONLY when the request's Origin is exactly the configured marketing
 * origin. No wildcard, no suffix matching, no allowlist bypass — an origin
 * that doesn't match gets no CORS headers at all, so the browser blocks the
 * response regardless of status code.
 *
 * Same-origin requests never need these headers; they're simply omitted.
 *
 * CORS is an origin gate, not an auth mechanism: every route that uses this
 * keeps its existing session and validation checks untouched.
 */

/** The exact marketing origin this deployment accepts, or null when unset. */
function allowedCrossOriginOrigin(): string | null {
  try {
    return new URL(getMarketingUrl()).origin;
  } catch {
    return null;
  }
}

/**
 * True when the request's Origin header is exactly the marketing origin
 * (cross-origin caller) or equals the request's own origin (same-origin).
 */
export function isAllowedCheckoutOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin).origin;
    if (originUrl === new URL(request.url).origin) return true;
    return originUrl === allowedCrossOriginOrigin();
  } catch {
    return false;
  }
}

/**
 * Attach the marketing CORS headers to a response when — and only when — the
 * request came from the marketing origin. Applied to every response path
 * (success and errors) so the caller can always read the JSON body.
 */
export function withMarketingCors<T extends Response>(
  response: T,
  request: Request,
): T {
  const origin = request.headers.get("origin");
  if (!origin || origin !== allowedCrossOriginOrigin()) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }) as T;
}

/** Preflight answer for the marketing origin; null when not applicable. */
export function marketingCorsPreflight(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== allowedCrossOriginOrigin()) return null;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
