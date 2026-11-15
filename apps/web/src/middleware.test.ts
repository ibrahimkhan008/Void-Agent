import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

describe("middleware cookie redirect", () => {
  it("lets signed-in admins reach the admin dashboard", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/admin", {
        headers: { cookie: "better-auth.session_token=valid" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets the Navigator MCP endpoint answer for itself without a cookie", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/api/navigator-mcp", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects other API routes without a cookie", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/api/admin/api-keys"),
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
    "/logo-192.webp",
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
      new NextRequest("http://localhost/marketplace-mcp-evil"),
    );
    expect(response.status).toBe(307);
  });
});

describe("marketing site redirects", () => {
  it.each([
    "/landing",
    "/pricing",
    "/about",
    "/docs",
    "/docs/mcp",
    "/contact",
    "/contact-sales",
    "/vs/manus",
    "/index",
    "/updates",
    "/branding",
    "/privacy-policy",
    "/terms-of-service",
    "/cookies-policy",
    "/refund-policy",
    "/grievance-redressal",
    "/llms.txt",
    "/design.md",
  ])(
    "permanently redirects former marketing page %s to the marketing site",
    async (path) => {
      vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://voidagent.space");
      try {
        const response = await middleware(
          new NextRequest(`http://localhost${path}`),
        );
        expect(response.status).toBe(308);
        expect(response.headers.get("location")).toBe(
          `https://voidagent.space${path === "/landing" ? "/" : path === "/updates" ? "/index" : path}`,
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("preserves the query string across the marketing redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://voidagent.space");
    try {
      const response = await middleware(
        new NextRequest("http://localhost/pricing?ref=launch"),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://voidagent.space/pricing?ref=launch",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("redirects anonymous visitors from / to the marketing homepage without caching", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://voidagent.space");
    try {
      const response = await middleware(new NextRequest("http://localhost/"));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://voidagent.space/");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps signed-in users on the chat workspace at /", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/", {
        headers: { cookie: "better-auth.session_token=valid" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects marketing paths for signed-in users — the routes are gone", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://voidagent.space");
    try {
      const response = await middleware(
        new NextRequest("http://localhost/pricing", {
          headers: { cookie: "better-auth.session_token=valid" },
        }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://voidagent.space/pricing",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not redirect marketing path lookalikes — they fall through to the auth gate", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/pricing-evil"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
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
