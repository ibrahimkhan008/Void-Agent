import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

describe("middleware cookie redirect", () => {
  it("lets the Navigator MCP endpoint answer for itself without a cookie", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/api/navigator-mcp", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects other API routes without a cookie", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/api/cockpit/api-keys"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  it("does not exempt look-alike paths", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/api/navigator-mcp-admin"),
    );
    expect(response.status).toBe(307);
  });
});

describe("destination public surfaces remain narrowly authenticated", () => {
  it.each([
    "/api/v1/threads",
    "/api/v1/agents",
    "/api/inbound/opaque-token",
    "/api/embed/session",
    "/api/navigator-mcp",
    "/api/webhooks/composio",
    "/api/voice/devices/register",
    "/embed/agent-123",
    "/embed.js",
    "/flare-logo-192.webp",
  ])("lets endpoint %s reach its own authentication boundary", async (path) => {
    const response = await middleware(
      new NextRequest(`http://localhost${path}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/api/private",
    "/api/private.png",
    "/api/v1evil/threads",
    "/api/inbound-admin/token",
    "/api/embed/session-admin",
    "/api/navigator-mcp-admin",
  ])("does not exempt lookalike or session-backed path %s", async (path) => {
    const response = await middleware(
      new NextRequest(`http://localhost${path}`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  });
});

describe("public product pages use the public auth boundary", () => {
  it.each([
    "/terms-of-service",
    "/privacy-policy",
    "/about",
    "/plans",
    "/gallery/agents",
    "/gallery/agents/some-agent",
    "/marketplace/mcp",
    "/team-invitations/accept",
    "/manifest.json",
    "/sw.js",
  ])("allows public destination page %s", async (path) => {
    const response = await middleware(
      new NextRequest(`http://localhost${path}`),
    );
    expect(response.status).toBe(200);
  });

  it("does not allow public page prefix lookalikes", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/terms-of-service-evil"),
    );
    expect(response.status).toBe(307);
  });
});

describe("custom auth cookie prefix", () => {
  it("uses AUTH_COOKIE_PREFIX when resolving session cookies", async () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "void-session");
    try {
      const response = await middleware(
        new NextRequest("http://localhost/dashboard", {
          headers: { cookie: "void-session.session_token=valid" },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Sentry tunnel middleware boundary", () => {
  it("allows only the fixed reporting tunnel when Sentry is enabled", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("SENTRY_ENABLED", "true");
    try {
      const response = await middleware(
        new NextRequest("http://localhost/monitoring", { method: "POST" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps the tunnel behind normal session middleware when Sentry is disabled", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("SENTRY_ENABLED", "false");
    try {
      const response = await middleware(
        new NextRequest("http://localhost/monitoring"),
      );
      expect(response.status).toBe(307);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
