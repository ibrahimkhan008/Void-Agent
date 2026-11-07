import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/pg/repositories/problem-report-admin-repository.pg", () => ({
  listProblemReports: mocks.list,
  problemReportStatuses: ["open", "in_review", "resolved"],
}));

import { GET } from "./route";

describe("GET /api/admin/problem-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.list.mockResolvedValue({ reports: [], hasMore: false });
  });

  it("does not access report data without an authenticated admin", async () => {
    mocks.getSession.mockResolvedValue(null);
    const anonymous = await GET(
      new Request("https://app.test/api/admin/problem-reports"),
    );
    expect(anonymous.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireAdminPermission.mockRejectedValue(new Error("forbidden"));
    const forbidden = await GET(
      new Request("https://app.test/api/admin/problem-reports"),
    );
    expect(forbidden.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("validates bounded pagination and status before querying", async () => {
    const badLimit = await GET(
      new Request("https://app.test/api/admin/problem-reports?limit=51"),
    );
    expect(badLimit.status).toBe(400);
    const badOffset = await GET(
      new Request("https://app.test/api/admin/problem-reports?offset=10001"),
    );
    expect(badOffset.status).toBe(400);
    const badStatus = await GET(
      new Request("https://app.test/api/admin/problem-reports?status=deleted"),
    );
    expect(badStatus.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    const valid = await GET(
      new Request(
        "https://app.test/api/admin/problem-reports?limit=10&offset=50&status=in_review",
      ),
    );
    expect(valid.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      limit: 10,
      offset: 50,
      status: "in_review",
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "admin-problem-report-list",
      id: "admin-1",
      limit: 60,
      windowMs: 60_000,
    });
    expect(valid.headers.get("cache-control")).toContain("no-store");
  });

  it("returns Retry-After and avoids listing when an admin is throttled", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 14_300 });
    const response = await GET(
      new Request("https://app.test/api/admin/problem-reports"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
