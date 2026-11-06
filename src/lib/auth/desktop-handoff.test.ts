import { describe, expect, it } from "vitest";
import { buildDesktopCallbackUrl, buildDesktopHandoffPath, isValidDesktopState, parseDesktopAuthDeepLink, sanitizeDesktopReturnTo } from "./desktop-handoff";

const state = "a_".repeat(20);

describe("desktop authentication handoff", () => {
  it("accepts only high-entropy encoded state values", () => {
    expect(isValidDesktopState(state)).toBe(true);
    expect(isValidDesktopState("short")).toBe(false);
    expect(isValidDesktopState([state])).toBe(false);
  });

  it("round-trips a bounded one-time token and state through the app scheme", () => {
    const deepLink = buildDesktopCallbackUrl({ token: "t".repeat(64), state });
    expect(parseDesktopAuthDeepLink(deepLink)).toEqual({ token: "t".repeat(64), state });
    expect(parseDesktopAuthDeepLink(deepLink.replace("voidagent:", "https:"))).toBeNull();
    expect(buildDesktopHandoffPath(state)).toContain(encodeURIComponent(state));
  });

  it("rejects protocol-relative and external return destinations", () => {
    expect(sanitizeDesktopReturnTo("/mcp/test/abc")).toBe("/mcp/test/abc");
    expect(sanitizeDesktopReturnTo("//evil.example/path")).toBe("/");
    expect(sanitizeDesktopReturnTo("/\\evil.example")).toBe("/");
    expect(sanitizeDesktopReturnTo("https://evil.example")).toBe("/");
  });
});
