import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  finish: vi.fn(),
}));

vi.mock("lib/connectors/oauth-state", () => ({
  consumeConnectorOAuthState: mocks.consume,
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  finishConnectorOAuth: mocks.finish,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(null);
  mocks.finish.mockResolvedValue({ ok: true });
});

describe("GET /api/connectors/[provider]/callback", () => {
  it("finishes OAuth and returns a same-origin popup message with security headers", async () => {
    const response = await GET(
      new NextRequest(
        "https://void.example/api/connectors/gmail/callback?code=abc&state=opaque",
      ),
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("CONNECTOR_OAUTH_SUCCESS");
    expect(html).toContain("window.location.origin");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.finish).toHaveBeenCalledWith("gmail", "abc", "opaque");
    expect(html).not.toContain("secret");
  });

  it("consumes provider-denial state but never reflects provider errors or redirects", async () => {
    const response = await GET(
      new NextRequest(
        "https://void.example/api/connectors/gmail/callback?error=secret_provider_detail&state=opaque&redirect=https%3A%2F%2Fevil.test",
      ),
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    const html = await response.text();
    expect(response.status).toBe(400);
    expect(mocks.consume).toHaveBeenCalledWith("opaque");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(html).not.toContain("secret_provider_detail");
    expect(html).not.toContain("evil.test");
  });

  it("rejects unknown provider, missing code, and oversized inputs", async () => {
    const unknown = await GET(
      new NextRequest(
        "https://void.example/api/connectors/evil/callback?code=abc&state=opaque",
      ),
      { params: Promise.resolve({ provider: "evil" }) },
    );
    const missing = await GET(
      new NextRequest(
        "https://void.example/api/connectors/gmail/callback?state=opaque",
      ),
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    const oversized = await GET(
      new NextRequest(
        `https://void.example/api/connectors/gmail/callback?code=${"x".repeat(4100)}&state=opaque`,
      ),
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    expect(unknown.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});
