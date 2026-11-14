/**
 * Central cross-domain URL configuration for the marketing site.
 *
 * The marketing site (this app, voidagent.space) and the product app
 * (apps/web, app.voidagent.space) are deployed independently. Every link
 * that crosses the domain boundary must go through these constants — no
 * hardcoded domains in components.
 *
 * NEXT_PUBLIC_* values are inlined at build time; the fallbacks default to
 * the real production domains so a build without env vars is still
 * prod-safe. Dev overrides both via .env.local (localhost:3001 / :3000).
 */

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

export const MARKETING_URL =
  normalizeOrigin(process.env.NEXT_PUBLIC_MARKETING_URL) ??
  "https://voidagent.space";

export const APP_URL =
  normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  (process.env.NODE_ENV === "production"
    ? "https://app.voidagent.space"
    : "http://localhost:3000");
