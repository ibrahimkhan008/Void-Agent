import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
  hasSameOrigin: vi.fn(),
  checkApiRateLimit: vi.fn(),
  readBoundedRequestBody: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: mocks.getConfig,
    upsert: mocks.upsert,
  },
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/http/bounded-request-body", () => ({
  readBoundedRequestBody: mocks.readBoundedRequestBody,
}));

import { GET, PATCH } from "./route";

const admin = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: admin });
  mocks.requireAdminPermission.mockResolvedValue(undefined);
  mocks.getConfig.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue(undefined);
  mocks.hasSameOrigin.mockReturnValue(true);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.readBoundedRequestBody.mockImplementation(async (request: Request) =>
    new TextEncoder().encode(await request.text()),
  );
});

describe("/api/admin/security-settings", () => {
  it("returns a safe default when config does not exist", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ securityEventsLookback: 50 });
  });

  it("requires an administrator for reads and writes", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(
      (
        await PATCH(
          new Request("https://app.test/api/admin/security-settings", {
            method: "PATCH",
            body: JSON.stringify({ securityEventsLookback: 25 }),
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("rejects cross-origin updates and invalid lookback values", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const forbidden = await PATCH(
      new Request("https://app.test/api/admin/security-settings", {
        method: "PATCH",
        body: JSON.stringify({ securityEventsLookback: 25 }),
      }),
    );
    expect(forbidden.status).toBe(403);

    mocks.hasSameOrigin.mockReturnValue(true);
    const invalid = await PATCH(
      new Request("https://app.test/api/admin/security-settings", {
        method: "PATCH",
        body: JSON.stringify({ securityEventsLookback: 501 }),
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("preserves unrelated security config when updating lookback", async () => {
    mocks.getConfig.mockResolvedValue({ headers: { xFrameOptions: "DENY" } });
    const response = await PATCH(
      new Request("https://app.test/api/admin/security-settings", {
        method: "PATCH",
        body: JSON.stringify({ securityEventsLookback: 25 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      "security",
      {
        headers: { xFrameOptions: "DENY" },
        securityEventsLookback: 25,
      },
      "admin-1",
      "update",
    );
  });
});
