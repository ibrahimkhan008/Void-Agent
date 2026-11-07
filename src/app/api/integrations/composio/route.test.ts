import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  configured: vi.fn(),
  listAccounts: vi.fn(),
  listToolkits: vi.fn(),
  authorize: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/ai/composio", () => ({
  isComposioConfigured: mocks.configured,
  listComposioAccountsForUser: mocks.listAccounts,
  listComposioToolkits: mocks.listToolkits,
  authorizeComposioToolkit: mocks.authorize,
  disconnectComposioAccount: mocks.disconnect,
}));

import { DELETE, GET, POST } from "./route";

const userId = "user-1";
const accountId = "account-1";

function request(
  method: string,
  body?: unknown,
  origin = "https://app.example",
) {
  return new Request("https://app.example/api/integrations/composio", {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Composio app connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.configured.mockReturnValue(true);
    mocks.listAccounts.mockResolvedValue([
      { id: accountId, isDisabled: false, toolkit: { slug: "github" } },
    ]);
    mocks.listToolkits.mockResolvedValue({
      items: [
        {
          slug: "github",
          name: "GitHub",
          logo: "https://cdn.example/logo.svg",
        },
      ],
      nextCursor: "page-2",
    });
    mocks.authorize.mockResolvedValue("https://connect.example/oauth/start");
    mocks.disconnect.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("lists only safe catalog metadata and the caller's active accounts", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.toolkits[0]).toMatchObject({
      slug: "github",
      name: "GitHub",
      isConnected: true,
      connectedAccountId: accountId,
    });
    expect(body.accounts).toEqual([
      { id: accountId, toolkit: "github", status: "ACTIVE" },
    ]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.listAccounts).toHaveBeenCalledWith(userId);
  });

  it("derives the callback from the request origin and rejects open redirects", async () => {
    const response = await POST(request("POST", { toolkit: "github" }));
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(
      userId,
      "github",
      "https://app.example/mcp?composio=connected",
    );
    expect((await response.json()).redirectUrl).toBe(
      "https://connect.example/oauth/start",
    );
    expect(
      (
        await POST(
          request("POST", { toolkit: "github" }, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
  });

  it("does not disconnect an account unless it belongs to the authenticated user", async () => {
    mocks.listAccounts.mockResolvedValue([]);
    const response = await DELETE(
      request("DELETE", { connectedAccountId: accountId }),
    );
    expect(response.status).toBe(404);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects an owned account only after same-origin and rate checks", async () => {
    const response = await DELETE(
      request("DELETE", { connectedAccountId: accountId }),
    );
    expect(response.status).toBe(200);
    expect(mocks.disconnect).toHaveBeenCalledWith(accountId);
    expect(
      await DELETE(
        request(
          "DELETE",
          { connectedAccountId: accountId },
          "https://attacker.example",
        ),
      ).then((r) => r.status),
    ).toBe(403);
  });

  it("rejects malformed toolkit identifiers before requesting authorization", async () => {
    const response = await POST(
      request("POST", { toolkit: "https://attacker.example" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
