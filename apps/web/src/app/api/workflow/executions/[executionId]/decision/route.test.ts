import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as any,
  body: { decision: "approve", effectHash: "a".repeat(64) } as any,
  execution: {
    id: "0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8",
    workflowId: "workflow-1",
    workflowName: "Demo",
    graphRevision: "b".repeat(64),
    status: "awaiting_approval",
    pendingEffect: {
      nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
      kind: "http",
      target: "https://example.test/action",
      payload: { method: "POST" },
      hash: "a".repeat(64),
      started: false,
    },
  } as any,
  getActiveForUser: vi.fn(),
  cancelPendingApproval: vi.fn(),
  approvePendingEffect: vi.fn(),
  requireExecutableWorkflow: vi.fn(),
  resumeApprovedWorkflowExecution: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/notifications/contracts", () => ({
  readBoundedJson: async () => ({ ok: true, value: mocks.body }),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.checkApiRateLimit(...args),
}));
vi.mock("lib/db/pg/repositories/workflow-execution-repository.pg", () => ({
  workflowExecutionRepository: {
    getActiveForUser: (...args: unknown[]) => mocks.getActiveForUser(...args),
    cancelPendingApproval: (...args: unknown[]) =>
      mocks.cancelPendingApproval(...args),
    approvePendingEffect: (...args: unknown[]) =>
      mocks.approvePendingEffect(...args),
  },
}));
vi.mock("lib/ai/workflow/run-saved-workflow", () => ({
  WorkflowExecutionConflictError: class WorkflowExecutionConflictError extends Error {},
  WorkflowEffectUncertainError: class WorkflowEffectUncertainError extends Error {},
  requireExecutableWorkflow: (...args: unknown[]) =>
    mocks.requireExecutableWorkflow(...args),
  resumeApprovedWorkflowExecution: (...args: unknown[]) =>
    mocks.resumeApprovedWorkflowExecution(...args),
}));

import { POST } from "./route";

const URL =
  "https://voidagent.test/api/workflow/executions/0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8/decision";

function request(origin = "https://voidagent.test") {
  return new Request(URL, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(mocks.body),
  });
}

const context = {
  params: Promise.resolve({
    executionId: "0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8",
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "user-1" } };
  mocks.body = { decision: "approve", effectHash: "a".repeat(64) };
  mocks.execution = {
    id: "0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8",
    workflowId: "workflow-1",
    workflowName: "Demo",
    graphRevision: "b".repeat(64),
    status: "awaiting_approval",
    pendingEffect: {
      nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
      kind: "http",
      target: "https://example.test/action",
      payload: { method: "POST" },
      hash: "a".repeat(64),
      started: false,
    },
  };
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.getActiveForUser.mockResolvedValue(mocks.execution);
  mocks.cancelPendingApproval.mockResolvedValue({ id: mocks.execution.id });
  mocks.approvePendingEffect.mockResolvedValue({ id: mocks.execution.id });
  mocks.requireExecutableWorkflow.mockResolvedValue({ nodes: [], edges: [] });
  mocks.resumeApprovedWorkflowExecution.mockResolvedValue({
    status: "success",
    executionId: mocks.execution.id,
    history: [],
    result: { ok: true },
  });
});

describe("POST workflow execution decision", () => {
  it("returns 400 for null and array request bodies", async () => {
    mocks.body = null;
    expect((await POST(request(), context)).status).toBe(400);
    mocks.body = [];
    expect((await POST(request(), context)).status).toBe(400);
    expect(mocks.getActiveForUser).not.toHaveBeenCalled();
  });

  it("requires same-origin authenticated requests", async () => {
    const response = await POST(request("https://attacker.test"), context);
    expect(response.status).toBe(403);
    expect(mocks.getActiveForUser).not.toHaveBeenCalled();
  });

  it("rechecks permissions then approves the exact pending effect and resumes", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.getActiveForUser).toHaveBeenCalledWith(
      "user-1",
      mocks.execution.id,
    );
    expect(mocks.requireExecutableWorkflow).toHaveBeenCalledWith(
      "user-1",
      "workflow-1",
      "Demo",
      "b".repeat(64),
    );
    expect(mocks.approvePendingEffect).toHaveBeenCalledWith({
      userId: "user-1",
      executionId: mocks.execution.id,
      effectHash: "a".repeat(64),
    });
    expect(mocks.resumeApprovedWorkflowExecution).toHaveBeenCalledOnce();
  });

  it("rejects stale hashes without changing execution state", async () => {
    mocks.body = { decision: "approve", effectHash: "c".repeat(64) };
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(mocks.approvePendingEffect).not.toHaveBeenCalled();
    expect(mocks.resumeApprovedWorkflowExecution).not.toHaveBeenCalled();
  });

  it("cancels only the exact pending effect on rejection", async () => {
    mocks.body = { decision: "reject", effectHash: "a".repeat(64) };
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "cancelled" });
    expect(mocks.cancelPendingApproval).toHaveBeenCalledWith({
      userId: "user-1",
      executionId: mocks.execution.id,
      effectHash: "a".repeat(64),
    });
  });
});
