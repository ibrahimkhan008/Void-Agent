import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/projects/brain-dream", () => ({
  enqueueProjectBrainDream: mocks.enqueue,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const rootRunId = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: projectId }) };
const baseRequest = (method: "GET" | "POST", body?: unknown) =>
  new Request(`http://localhost/api/projects/${projectId}/brain/dream`, {
    method,
    headers: {
      Origin: "http://localhost",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

function queryWithRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: async () => rows }),
        limit: async () => rows,
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getProjectAccess.mockResolvedValue({ role: "editor" });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockImplementation(() => queryWithRows([]));
  mocks.enqueue.mockResolvedValue({ id: "new-run", created: true });
});

describe("project brain dream retry", () => {
  it("exposes retry eligibility without returning the internal idempotency key", async () => {
    mocks.select.mockImplementationOnce(() =>
      queryWithRows([
        {
          id: rootRunId,
          idempotencyKey: "nightly:2026-11-07",
          status: "partial",
          stage: "done",
          metrics: {},
          warnings: [],
          errorMessage: null,
          createdAt: new Date("2026-11-07T10:00:00Z"),
          updatedAt: new Date("2026-11-07T10:00:00Z"),
          finishedAt: new Date("2026-11-07T10:00:00Z"),
        },
      ]),
    );
    const response = await GET(baseRequest("GET"), context);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.runs[0].canRetry).toBe(true);
    expect(payload.runs[0]).not.toHaveProperty("idempotencyKey");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("retries a partial root run through the idempotent queue", async () => {
    mocks.select.mockImplementationOnce(() =>
      queryWithRows([
        {
          id: rootRunId,
          status: "partial",
          idempotencyKey: "nightly:2026-11-07",
        },
      ]),
    );
    const response = await POST(
      baseRequest("POST", { retryRunId: rootRunId }),
      context,
    );
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith({
      projectId,
      userId: "user-1",
      reason: "manual",
      idempotencyKey: `retry:${rootRunId}`,
    });
  });

  it("rejects retrying active, successful, or already-retry runs", async () => {
    for (const row of [
      { id: rootRunId, status: "running", idempotencyKey: "manual:hour" },
      { id: rootRunId, status: "succeeded", idempotencyKey: "manual:hour" },
      { id: rootRunId, status: "partial", idempotencyKey: "retry:older" },
    ]) {
      mocks.select.mockImplementationOnce(() => queryWithRows([row]));
      const response = await POST(
        baseRequest("POST", { retryRunId: rootRunId }),
        context,
      );
      expect(response.status).toBe(409);
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("requires same-origin editor access and limits retry request bodies", async () => {
    const foreign = new Request(
      `http://localhost/api/projects/${projectId}/brain/dream`,
      { method: "POST", headers: { Origin: "https://attacker.invalid" } },
    );
    expect((await POST(foreign, context)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValueOnce({ role: "viewer" });
    expect((await POST(baseRequest("POST"), context)).status).toBe(403);
    const tooLarge = new Request(
      `http://localhost/api/projects/${projectId}/brain/dream`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          retryRunId: rootRunId,
          extra: "x".repeat(3000),
        }),
      },
    );
    expect((await POST(tooLarge, context)).status).toBe(413);
  });
});
