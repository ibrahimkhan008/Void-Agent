/**
 * Pure helpers for the browser → desktop sign-in handoff.
 *
 * Ported from the Void Agent destination desktop (its `desktop-handoff.ts`,
 * which itself mirrors the web app's `lib/auth/desktop-handoff.ts`) and
 * adapted to this shell: the protocol constants and the deep-link grammar
 * live in ./deep-link.ts, the pending sign-in state machine in
 * ./pending-sign-in.ts. Everything here stays pure and free of `electron`
 * so the handoff round trip remains unit-testable.
 */
import {
  DESKTOP_HANDOFF_PATH,
  DESKTOP_PROTOCOL,
  parseAuthDeepLink,
} from "./deep-link.js";

export { isValidDesktopState } from "./deep-link.js";

/** Social providers the desktop sign-in handoff accepts. Matches the web
 * app's `SocialAuthenticationProvider` enum exactly. */
const SIGN_IN_PROVIDERS: ReadonlySet<string> = new Set([
  "google",
  "github",
  "microsoft",
]);

export type DesktopSignInProvider = "google" | "github" | "microsoft";

export function isSupportedSignInProvider(
  value: unknown,
): value is DesktopSignInProvider {
  return typeof value === "string" && SIGN_IN_PROVIDERS.has(value);
}

/** `keinsaas://auth/callback?token=…&state=…` — the link the web app builds. */
export function buildDesktopCallbackUrl(input: {
  token: string;
  state: string;
}): string {
  const query = new URLSearchParams({ token: input.token, state: input.state });
  return `${DESKTOP_PROTOCOL}://auth/callback?${query.toString()}`;
}

/** The in-app path the desktop shell passes as the sign-in `callbackUrl`. */
export function buildDesktopHandoffPath(state: string): string {
  return `${DESKTOP_HANDOFF_PATH}?state=${encodeURIComponent(state)}`;
}

/**
 * Parses a `keinsaas://` handoff link. Delegates to the canonical parser in
 * ./deep-link.ts; exported here so consumers of the handoff module share one
 * surface with the destination port.
 */
export function parseDesktopAuthDeepLink(value: string) {
  return parseAuthDeepLink(value);
}

/**
 * Destination-strength return-path guard: on top of the prefix rules in
 * ./pending-sign-in.ts it re-parses the value and refuses anything a URL
 * parser would read as another origin (protocol-relative hosts, backslash
 * tricks, embedded schemes). Always yields a plain in-app path or "/".
 */
export function sanitizeDesktopReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  try {
    const url = new URL(value, "https://keinsaas.invalid");
    return url.origin === "https://keinsaas.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
