export const VOID_AGENT_DESKTOP_PROTOCOL = "voidagent";
export const VOID_AGENT_DESKTOP_HANDOFF_PATH = "/desktop/auth/complete";
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export function isValidDesktopState(value: unknown): value is string {
  return typeof value === "string" && STATE_PATTERN.test(value);
}

export function buildDesktopCallbackUrl(input: { token: string; state: string }) {
  const query = new URLSearchParams({ token: input.token, state: input.state });
  return `${VOID_AGENT_DESKTOP_PROTOCOL}://auth/callback?${query.toString()}`;
}

export function buildDesktopHandoffPath(state: string) {
  return `${VOID_AGENT_DESKTOP_HANDOFF_PATH}?state=${encodeURIComponent(state)}`;
}

export function parseDesktopAuthDeepLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== `${VOID_AGENT_DESKTOP_PROTOCOL}:` || url.hostname !== "auth" || !["/callback", "/callback/"].includes(url.pathname)) return null;
    const token = url.searchParams.get("token") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (token.length < 16 || token.length > 256 || !isValidDesktopState(state)) return null;
    return { token, state };
  } catch {
    return null;
  }
}

export function sanitizeDesktopReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  try {
    const url = new URL(value, "https://void-agent.invalid");
    return url.origin === "https://void-agent.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
