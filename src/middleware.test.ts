import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

describe("middleware session cookie prefixes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("preserves the requested page for login without allowing other-app cookies", async () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "void-agent-legacy");
    const response = await middleware(
      new NextRequest("http://localhost/chat/123?mode=tools"),
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/chat/123?mode=tools",
    );
  });

  it("recognizes this app's custom session cookie after OAuth", async () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "void-agent-legacy");
    const response = await middleware(
      new NextRequest("http://localhost/dashboard", {
        headers: { cookie: "void-agent-legacy.session_token=test-session" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not use the other app's session cookie", async () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "void-agent-legacy");
    const response = await middleware(
      new NextRequest("http://localhost/dashboard", {
        headers: { cookie: "void-agent-v2.session_token=test-session" },
      }),
    );
    expect(response.status).toBe(307);
  });

  it("keeps the default cookie name when no prefix is configured", async () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "");
    const response = await middleware(
      new NextRequest("http://localhost/dashboard", {
        headers: { cookie: "better-auth.session_token=test-session" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("allows unlisted published-page links without an account cookie", async () => {
    const response = await middleware(
      new NextRequest(`http://localhost/p/launch-${"a".repeat(24)}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
