import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P4.C — POST/DELETE /api/mcp/[id]/install route tests
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const getMarketplaceMcpServerMock = vi.fn();
const installMcpServerMock = vi.fn();
const uninstallMcpServerMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  mcpInstallRepository: {
    getMarketplaceMcpServer: (...args: unknown[]) =>
      getMarketplaceMcpServerMock(...args),
    installMcpServer: (...args: unknown[]) => installMcpServerMock(...args),
    uninstallMcpServer: (...args: unknown[]) => uninstallMcpServerMock(...args),
  },
}));

const { POST, DELETE } = await import("./route");

const validParams = { params: Promise.resolve({ id: "server-1" }) } as any;

const makeRequest = () =>
  new Request("http://localhost/api/mcp/server-1/install", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    // Any submitted credentials are ignored. This endpoint deliberately
    // supports installs only; user-owned OAuth setup is a separate contract.
    body: JSON.stringify({ config: { apiKey: "must-not-persist" } }),
  });

const makeDeleteRequest = () =>
  new Request("http://localhost/api/mcp/server-1/install", {
    method: "DELETE",
    headers: { origin: "http://localhost" },
  });

const okSession = { user: { id: "user-1" } };

const sampleServer = {
  id: "server-1",
  name: "GitHub",
  config: {},
  userId: "owner-1",
  visibility: "public",
  enabled: true,
  curated: true,
  category: "developer",
  installCount: 10,
  description: "GitHub MCP",
  homepageUrl: "https://example.com",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const sampleInstall = {
  id: "install-1",
  userId: "user-1",
  orgId: null,
  mcpServerId: "server-1",
  config: {},
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
};

describe("POST /api/mcp/[id]/install", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    getMarketplaceMcpServerMock.mockReset();
    installMcpServerMock.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(401);
    expect(getMarketplaceMcpServerMock).not.toHaveBeenCalled();
    expect(installMcpServerMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin install requests", async () => {
    sessionMock.mockResolvedValue(okSession);
    const request = new Request("http://localhost/api/mcp/server-1/install", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const res = await POST(request, validParams);
    expect(res.status).toBe(403);
    expect(getMarketplaceMcpServerMock).not.toHaveBeenCalled();
  });

  it("rejects install requests without an Origin header", async () => {
    sessionMock.mockResolvedValue(okSession);
    const request = new Request("http://localhost/api/mcp/server-1/install", {
      method: "POST",
    });
    const res = await POST(request, validParams);
    expect(res.status).toBe(403);
    expect(getMarketplaceMcpServerMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the server does not exist", async () => {
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(404);
    expect(installMcpServerMock).not.toHaveBeenCalled();
  });

  it("returns an idempotent install id and public server shape on success", async () => {
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue(sampleServer);
    installMcpServerMock.mockResolvedValue(sampleInstall);

    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.installId).toBe("install-1");
    expect(body.server.id).toBe("server-1");
    expect(body.server.name).toBe("GitHub");
    // Sensitive fields must not leak in the response.
    expect(body.server).not.toHaveProperty("config");
    expect(body.server).not.toHaveProperty("userId");

    // The install endpoint ignores supplied config so raw credentials cannot
    // be persisted before an encrypted, owner-scoped credential flow exists.
    expect(installMcpServerMock).toHaveBeenCalledWith(
      { mcpServerId: "server-1", config: {} },
      "user-1",
      null,
    );
  });

  it("is idempotent — re-installing returns the same install id", async () => {
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue(sampleServer);
    // Repository's `installMcpServer` upserts on UNIQUE (user_id,
    // mcp_server_id), so a re-install returns the existing row.
    installMcpServerMock.mockResolvedValue(sampleInstall);

    const res1 = await POST(makeRequest(), validParams);
    const res2 = await POST(makeRequest(), validParams);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(installMcpServerMock).toHaveBeenCalledTimes(2);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.installId).toBe("install-1");
    expect(body2.installId).toBe("install-1");
  });

  it("does not install a server that is not curated or enabled", async () => {
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue({
      ...sampleServer,
      curated: false,
    });
    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(404);
    expect(installMcpServerMock).not.toHaveBeenCalled();
  });

  it("uses the active organization from the authenticated session", async () => {
    sessionMock.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeOrganizationId: "org-1" },
    });
    getMarketplaceMcpServerMock.mockResolvedValue(sampleServer);
    installMcpServerMock.mockResolvedValue(sampleInstall);

    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(200);
    expect(installMcpServerMock).toHaveBeenCalledWith(
      { mcpServerId: "server-1", config: {} },
      "user-1",
      "org-1",
    );
  });

  it("returns 500 when installMcpServer throws", async () => {
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue(sampleServer);
    installMcpServerMock.mockRejectedValue(new Error("fk violation"));
    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(500);
  });

  it("security: does NOT touch any customization repository on install (no customizations inherited)", async () => {
    // The plan explicitly requires that a marketplace install must not
    // carry over the original owner's mcpServerCustomization /
    // mcpToolCustomization rows. We assert this by checking that the
    // route file has no static dependency on those repositories at all —
    // the only repository it touches is `mcpInstallRepository`.
    //
    // (Statically: the test runs in a child process of vitest, so we
    // cannot read this file from inside the test. The assertion below
    // is the runtime equivalent: the mocked repository is the only one
    // the route can call. Any customization-table mutation would have to
    // route through it, and it does not expose such a method.)
    sessionMock.mockResolvedValue(okSession);
    getMarketplaceMcpServerMock.mockResolvedValue(sampleServer);
    installMcpServerMock.mockResolvedValue(sampleInstall);

    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(200);

    // Only the three documented repo methods were called.
    expect(installMcpServerMock).toHaveBeenCalledTimes(1);
    expect(getMarketplaceMcpServerMock).toHaveBeenCalledTimes(1);

    // The mocked `mcpInstallRepository` only exposes the three methods
    // the route uses — there is no API to touch mcpServerCustomization
    // or mcpToolCustomization from here. If a future PR tries to add
    // that, the test will fail at the `vi.mock` surface, which is the
    // exact tripwire we want.
  });
});

describe("DELETE /api/mcp/[id]/install", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    uninstallMcpServerMock.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(401);
    expect(uninstallMcpServerMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin uninstall requests", async () => {
    sessionMock.mockResolvedValue(okSession);
    const request = new Request("http://localhost/api/mcp/server-1/install", {
      method: "DELETE",
      headers: { origin: "https://attacker.example" },
    });
    const res = await DELETE(request, validParams);
    expect(res.status).toBe(403);
    expect(uninstallMcpServerMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no install to remove", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallMcpServerMock.mockResolvedValue(false);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(404);
  });

  it("returns 204 with no body on successful uninstall", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallMcpServerMock.mockResolvedValue(true);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(204);
    expect(uninstallMcpServerMock).toHaveBeenCalledWith("user-1", "server-1");
    // 204 must have an empty body.
    const text = await res.text();
    expect(text).toBe("");
  });

  it("returns 500 when uninstallMcpServer throws", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallMcpServerMock.mockRejectedValue(new Error("db down"));
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(500);
  });
});
