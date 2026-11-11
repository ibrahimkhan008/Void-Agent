import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as any,
  getHistoryForUser: vi.fn(),
  getActiveForUser: vi.fn(),
  requireExecutableWorkflow: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/db/pg/repositories/workflow-execution-repository.pg", () => ({
  workflowExecutionRepository: {
    getHistoryForUser: (...args: unknown[]) => mocks.getHistoryForUser(...args),
    getActiveForUser: (...args: unknown[]) => mocks.getActiveForUser(...args),
  },
}));
vi.mock("lib/ai/workflow/run-saved-workflow", () => ({
  requireExecutableWorkflow: (...args: unknown[]) =>
    mocks.requireExecutableWorkflow(...args),
  toWorkflowEffectReview: (effect: unknown) => ({
    ...(effect as Record<string, unknown>),
    payload: { credential: "[redacted]", safe: "kept" },
  }),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.checkApiRateLimit(...args),
}));

import { GET } from "./route";

const executionId = "0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8";
const context = { params: Promise.resolve({ executionId }) };
const progress = {
  completedNodes: {
    "a2b79fe0-05c3-41f0-9a76-808075a7aaf1": {
      input: { private: "input" },
      output: { secret: "output" },
    },
  },
};

describe("GET /api/workflow/executions/[executionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "user-1" } };
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.getHistoryForUser.mockResolvedValue({
      id: executionId,
      userId: "user-1",
      workflowId: "workflow-1",
      workflowName: "Invoice flow",
      graphRevision: "b".repeat(64),
      status: "awaiting_approval",
      progress,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-11-08T00:00:00Z"),
      updatedAt: new Date("2026-11-08T00:01:00Z"),
    });
    mocks.getActiveForUser.mockResolvedValue({
      pendingEffect: {
        nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
        kind: "http",
        target: "https://example.test/action",
        payload: { credential: "server-secret", safe: "kept" },
        hash: "a".repeat(64),
        started: false,
      },
    });
    mocks.requireExecutableWorkflow.mockResolvedValue({ nodes: [], edges: [] });
  });

  it("returns a bounded review view for the owner without raw checkpoint data", async () => {
    const response = await GET(
      new Request(
        `https://void-agent.test/api/workflow/executions/${executionId}`,
      ),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getHistoryForUser).toHaveBeenCalledWith("user-1", executionId);
    expect(mocks.requireExecutableWorkflow).toHaveBeenCalledWith(
      "user-1",
      "workflow-1",
      "Invoice flow",
      "b".repeat(64),
    );
    const body = await response.json();
    expect(body.execution).toMatchObject({
      id: executionId,
      status: "awaiting_approval",
      completedNodeCount: 1,
      canApprove: true,
      canReject: true,
      pendingEffect: {
        hash: "a".repeat(64),
        payload: { credential: "[redacted]", safe: "kept" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("server-secret");
    expect(JSON.stringify(body)).not.toContain('"private":"input"');
    expect(JSON.stringify(body)).not.toContain('"secret":"output"');
  });

  it("allows the owner to inspect and reject a pending action after workflow access is revoked", async () => {
    mocks.requireExecutableWorkflow.mockRejectedValueOnce(new Error("revoked"));
    const response = await GET(new Request("https://void-agent.test"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      execution: {
        canApprove: false,
        canReject: true,
        pendingEffect: { hash: "a".repeat(64) },
      },
    });
  });

  it("does not expose a review payload after the approval expires", async () => {
    mocks.getHistoryForUser.mockResolvedValueOnce({
      id: executionId,
      userId: "user-1",
      workflowId: "workflow-1",
      workflowName: "Invoice flow",
      graphRevision: "b".repeat(64),
      status: "awaiting_approval",
      progress,
      expiresAt: new Date(Date.now() - 1),
      createdAt: new Date("2026-11-08T00:00:00Z"),
      updatedAt: new Date("2026-11-08T00:01:00Z"),
    });
    const response = await GET(new Request("https://void-agent.test"), context);
    const body = await response.json();
    expect(body.execution).toMatchObject({
      expired: true,
      pendingEffect: null,
      canApprove: false,
      canReject: false,
    });
    expect(mocks.getActiveForUser).not.toHaveBeenCalled();
  });

  it("returns 404 for executions outside the caller's owner scope", async () => {
    mocks.getHistoryForUser.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://void-agent.test"), context);
    expect(response.status).toBe(404);
    expect(mocks.getActiveForUser).not.toHaveBeenCalled();
  });

  it("validates the execution ID and requires an authenticated owner", async () => {
    const invalid = await GET(new Request("https://void-agent.test"), {
      params: Promise.resolve({ executionId: "not-a-uuid" }),
    });
    expect(invalid.status).toBe(400);
    expect(mocks.getHistoryForUser).not.toHaveBeenCalled();

    mocks.session = null;
    expect(
      (await GET(new Request("https://void-agent.test"), context)).status,
    ).toBe(401);
  });
});
