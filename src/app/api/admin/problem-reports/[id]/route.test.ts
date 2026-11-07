import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/pg/repositories/problem-report-admin-repository.pg", () => ({
  updateProblemReportStatus: mocks.update,
}));

import { PATCH } from "./route";

const id = "123e4567-e89b-42d3-a456-426614174000";
const makeRequest = (body: unknown, origin = "https://app.test") =>
  new Request(`https://app.test/api/admin/problem-reports/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

describe("PATCH /api/admin/problem-reports/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.update.mockResolvedValue({
      id,
      status: "resolved",
      updatedAt: new Date(),
    });
  });

  it("requires an authenticated admin and rejects cross-origin requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(
      (
        await PATCH(makeRequest({ status: "resolved" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAdminPermission.mockRejectedValue(new Error("forbidden"));
    expect(
      (
        await PATCH(makeRequest({ status: "resolved" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (
        await PATCH(makeRequest({ status: "resolved" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts only valid statuses and updates no report fields other than status", async () => {
    const invalid = await PATCH(
      makeRequest({ status: "closed", description: "tamper" }),
      { params: Promise.resolve({ id }) },
    );
    expect(invalid.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();

    const valid = await PATCH(makeRequest({ status: "resolved" }), {
      params: Promise.resolve({ id }),
    });
    expect(valid.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(id, "resolved");
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "admin-problem-report-status-update",
      id: "admin-1",
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("returns Retry-After without changing the report when updates are throttled", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 2_100 });
    const response = await PATCH(makeRequest({ status: "resolved" }), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
