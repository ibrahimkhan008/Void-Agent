import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ begin: vi.fn() }));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: any) => (request: any, context: any) =>
    handler(request, { user: { id: "user-7" } }, context),
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  beginConnectorOAuth: mocks.begin,
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/connectors/[provider]/authorize", () => {
  it("starts a fixed allowlisted connector for the authenticated user", async () => {
    mocks.begin.mockResolvedValue({
      ok: true,
      authUrl: "https://accounts.google.com/oauth",
    });
    const response = await GET(
      new Request("https://void.example/api/connectors/gmail/authorize") as any,
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      authUrl: "https://accounts.google.com/oauth",
    });
    expect(mocks.begin).toHaveBeenCalledWith("user-7", "gmail");
  });

  it("rejects a provider path that is not in the static allowlist", async () => {
    const response = await GET(
      new Request("https://void.example/api/connectors/evil/authorize") as any,
      { params: Promise.resolve({ provider: "evil" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("returns a generic configuration error without leaking secrets", async () => {
    mocks.begin.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Connector is not configured",
    });
    const response = await GET(
      new Request("https://void.example/api/connectors/gmail/authorize") as any,
      { params: Promise.resolve({ provider: "gmail" }) },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Connector is not configured",
    });
  });
});
