import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as any,
  listRecentForUser: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/db/pg/repositories/workflow-execution-repository.pg", () => ({
  workflowExecutionRepository: {
    listRecentForUser: (...args: unknown[]) => mocks.listRecentForUser(...args),
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.checkApiRateLimit(...args),
}));

import { GET } from "./route";

describe("GET /api/workflow/executions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "user-1" } };
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.listRecentForUser.mockResolvedValue([
      {
        id: "run-1",
        workflowId: "workflow-1",
        workflowName: "Invoice flow",
        status: "awaiting_approval",
        progress: {
          completedNodes: {
            "a2b79fe0-05c3-41f0-9a76-808075a7aaf1": {
              input: { text: "x" },
              output: { text: "y" },
            },
          },
        },
        createdAt: new Date("2026-11-08T00:00:00Z"),
        updatedAt: new Date("2026-11-08T00:01:00Z"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
  });

  it("returns only the authenticated owner's recent status summaries", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listRecentForUser).toHaveBeenCalledWith("user-1", 20);
    expect(await response.json()).toMatchObject({
      executions: [
        {
          id: "run-1",
          workflowName: "Invoice flow",
          status: "awaiting_approval",
          completedNodeCount: 1,
          expired: false,
        },
      ],
    });
  });

  it("requires authentication and rate limits reads before accessing history", async () => {
    mocks.session = null;
    expect((await GET()).status).toBe(401);
    expect(mocks.listRecentForUser).not.toHaveBeenCalled();

    mocks.session = { user: { id: "user-1" } };
    mocks.checkApiRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await GET()).status).toBe(429);
    expect(mocks.listRecentForUser).not.toHaveBeenCalled();
  });

  it("does not return raw progress, errors, or effect payloads", async () => {
    const response = await GET();
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("completedNodes");
    expect(JSON.stringify(body)).not.toContain("pendingEffect");
    expect(JSON.stringify(body)).not.toContain("error");
  });
});
