import { getMarketingUrl } from "lib/marketing-url";

/**
 * Normalise a user-supplied `callbackUrl` to a safe post-auth redirect.
 * Prevents open-redirects: only in-app paths (single leading "/", no "//" or
 * "/\\") are accepted, plus — for the marketing split — an absolute URL whose
 * origin is EXACTLY the configured marketing origin (voidagent.space). The
 * marketing pricing page sends users here with the full checkout intent in
 * the callback so they can resume after signing in. Anything else returns
 * undefined.
 */
export function sanitizeCallbackUrl(
  value: string | string[] | undefined | null,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
    return raw;
  }
  // Absolute URLs: only the exact marketing origin may pass. Everything
  // else — including lookalike hosts and other subdomains — is rejected.
  try {
    const url = new URL(raw);
    if (url.origin === new URL(getMarketingUrl()).origin) {
      return url.toString();
    }
  } catch {
    // not a parseable URL — reject below
  }
  return undefined;
}

/** Build a `?callbackUrl=…` query suffix (or "") for an auth link. */
export function callbackUrlQuery(callbackUrl: string | undefined): string {
  return callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
}
