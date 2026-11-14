/**
 * Absolute origin of the standalone marketing site (apps/marketing, served at
 * https://voidagent.space). The marketing pages were extracted out of this
 * app — every cross-domain link and the CORS/callback allowlists resolve
 * through this helper so the origin is configured in exactly one place.
 *
 * NEXT_PUBLIC_MARKETING_URL is the single source of truth. The fallback
 * defaults to the production domain (prod-safe builds without env), while
 * dev falls back to the marketing app's localhost port.
 */
export function getMarketingUrl(): string {
  const raw = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through to the environment-aware default
    }
  }
  return process.env.NODE_ENV === "production"
    ? "https://voidagent.space"
    : "http://localhost:3001";
}
