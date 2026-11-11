import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig, upsert: mocks.upsert },
}));

import { DELETE, GET, POST } from "./route";

const makeRequest = (
  body: unknown,
  method: "POST" | "DELETE" = "POST",
  url = "https://local.test/api/admin/tools",
) =>
  new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://local.test",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });

describe("dynamic tool administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.getConfig.mockResolvedValue({
      apiKeysSecrets: { keep: "stored-ciphertext" },
      categories: { Code: { enabled: true, tools: {} } },
      dynamicTools: {},
    });
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("lists registered dynamic tools without credentials", async () => {
    mocks.getConfig.mockResolvedValue({
      dynamicTools: {
        "github-issues": {
          name: "GitHub Issues",
          category: "Custom",
          description: "Read issues",
          enabled: true,
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      id: "github-issues",
      name: "GitHub Issues",
      enabled: true,
    });
    expect(JSON.stringify(body)).not.toContain("apiKeysSecrets");
    expect(JSON.stringify(body)).not.toContain("stored-ciphertext");
  });

  it("adds a tool with a normalized slug and preserves other tools config", async () => {
    const response = await POST(
      makeRequest({
        name: "GitHub Issues!!",
        category: "Custom",
        description: "Read issues",
        enabled: true,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("github-issues");
    const write = mocks.upsert.mock.calls[0];
    expect(write[0]).toBe("tools");
    expect(write[1].apiKeysSecrets).toEqual({ keep: "stored-ciphertext" });
    expect(write[1].dynamicTools["github-issues"].name).toBe("GitHub Issues!!");
    expect(write[1].dynamicTools["github-issues"].addedAt).toEqual(
      expect.any(String),
    );
  });

  it("updates an existing tool while keeping its original addedAt", async () => {
    mocks.getConfig.mockResolvedValue({
      dynamicTools: {
        "github-issues": {
          name: "Old Name",
          category: "Custom",
          description: "",
          enabled: true,
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    const response = await POST(
      makeRequest({
        id: "github-issues",
        name: "GitHub Issues",
        enabled: false,
      }),
    );
    expect(response.status).toBe(200);
    const write = mocks.upsert.mock.calls[0];
    expect(write[1].dynamicTools["github-issues"]).toMatchObject({
      name: "GitHub Issues",
      enabled: false,
      addedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("rejects unauthorized, cross-origin, rate-limited, and invalid writes", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect((await POST(makeRequest({ name: "X" }))).status).toBe(401);

    mocks.requireAdminPermission.mockResolvedValue(undefined);
    const crossOrigin = new Request("https://local.test/api/admin/tools", {
      method: "POST",
      headers: { Origin: "https://attacker.test" },
      body: JSON.stringify({ name: "X" }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);

    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(makeRequest({ name: "X" }))).status).toBe(429);

    expect((await POST(makeRequest({ nope: true }))).status).toBe(400);
    expect((await POST(makeRequest({ name: "" }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("deletes a tool and returns 404 for unknown ids", async () => {
    mocks.getConfig.mockResolvedValue({
      dynamicTools: {
        alpha: { name: "Alpha", addedAt: "2026-01-01T00:00:00.000Z" },
        beta: { name: "Beta", addedAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    const removed = await DELETE(
      makeRequest(
        null,
        "DELETE",
        "https://local.test/api/admin/tools?id=alpha",
      ),
    );
    expect(removed.status).toBe(200);
    const write = mocks.upsert.mock.calls[0];
    expect(Object.keys(write[1].dynamicTools)).toEqual(["beta"]);

    const missing = await DELETE(
      makeRequest(null, "DELETE", "https://local.test/api/admin/tools?id=zzz"),
    );
    expect(missing.status).toBe(404);

    const noId = await DELETE(
      makeRequest(null, "DELETE", "https://local.test/api/admin/tools"),
    );
    expect(noId.status).toBe(400);
  });
});
