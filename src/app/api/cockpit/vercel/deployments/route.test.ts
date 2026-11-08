import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  loadVercelSnapshot: vi.fn(),
  publicVercelError: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/vercel", () => ({
  loadVercelSnapshot: mocks.loadVercelSnapshot,
  publicVercelError: mocks.publicVercelError,
}));

import { GET } from "./route";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";

function request(path = "/api/cockpit/vercel/deployments") {
  return new Request(`https://app.test${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.resolveStripeScope.mockImplementation(
    async (userId: string, teamId: string | null) => ({
      ok: true,
      canManage: true,
      scope: { userId, teamId },
    }),
  );
  mocks.loadVercelSnapshot.mockResolvedValue({
    generatedAt: "2026-11-08T08:00:00.000Z",
    projects: [
      {
        key: "navigator",
        label: "Navigator",
        deploy: {
          id: "dpl_1",
          state: "READY",
          createdAt: "2026-11-08T07:00:00.000Z",
          url: "https://navigator.example",
          failedLast7d: 1,
        },
        error: null,
      },
    ],
  });
  mocks.publicVercelError.mockReturnValue(
    "Unable to load Vercel deployment data.",
  );
});

describe("Vercel deployment summary API", () => {
  it("requires a signed-in user and rate-limits before provider access", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const unauthenticated = await GET(request());
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(mocks.loadVercelSnapshot).not.toHaveBeenCalled();

    mocks.checkApiRateLimit.mockResolvedValueOnce({ allowed: false });
    const limited = await GET(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.loadVercelSnapshot).not.toHaveBeenCalled();
  });

  it("rejects invalid team selectors and resolves valid team read scope", async () => {
    const invalid = await GET(
      request("/api/cockpit/vercel/deployments?teamId=invalid"),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveStripeScope).not.toHaveBeenCalled();

    const response = await GET(
      request(`/api/cockpit/vercel/deployments?teamId=${TEAM_ID}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM_ID);
    expect(mocks.loadVercelSnapshot).toHaveBeenCalledWith({
      userId: "user-1",
      teamId: TEAM_ID,
    });
  });

  it("returns only the read-only deployment snapshot with private no-store headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      projects: [
        {
          key: "navigator",
          deploy: { state: "READY", failedLast7d: 1 },
        },
      ],
    });
    expect(mocks.loadVercelSnapshot).toHaveBeenCalledWith({
      userId: "user-1",
      teamId: null,
    });
  });

  it("does not reveal team data to a caller without readable team scope", async () => {
    mocks.resolveStripeScope.mockResolvedValueOnce({ ok: false });
    const response = await GET(
      request(`/api/cockpit/vercel/deployments?teamId=${TEAM_ID}`),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.loadVercelSnapshot).not.toHaveBeenCalled();
  });

  it("reports missing connections and provider failures without raw error details", async () => {
    mocks.loadVercelSnapshot.mockResolvedValueOnce(null);
    const missing = await GET(request());
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");

    mocks.loadVercelSnapshot.mockRejectedValueOnce(
      new Error("token=private-provider-response"),
    );
    const failed = await GET(request());
    expect(failed.status).toBe(502);
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
    expect(await failed.json()).toEqual({
      error: "Unable to load Vercel deployment data.",
    });
    expect(mocks.publicVercelError).toHaveBeenCalled();
  });
});
