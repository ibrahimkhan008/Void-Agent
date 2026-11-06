import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureN8nUser: vi.fn(),
  getWorkflow: vi.fn(),
  runWorkflow: vi.fn(),
  getWorkflowDefinition: vi.fn(),
  consume: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/n8n/provision", () => ({ ensureN8nUser: mocks.ensureN8nUser }));
vi.mock("lib/n8n/client", () => ({
  N8nError: class N8nError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  createUserClient: () => ({
    getWorkflow: mocks.getWorkflow,
    getWorkflowDefinition: mocks.getWorkflowDefinition,
    runWorkflow: mocks.runWorkflow,
  }),
}));
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({
  workflowRunApprovalRepository: { consume: mocks.consume },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));

import { getN8nWorkflowRevision } from "lib/n8n/workflow-review";
import { POST } from "./route";

const context = { params: Promise.resolve({ id: "workflow_123" }) };
const workflowDefinition = {
  id: "workflow_123",
  name: "Test workflow",
  active: false,
  description: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  nodes: [],
  connections: {},
  settings: null,
};
const validRevision = getN8nWorkflowRevision(workflowDefinition);
const request = (
  origin = "https://void-agent.test",
  body: unknown = {
    query: {},
    workflowName: "Test workflow",
    graphRevision: validRevision,
    approvalToken: "x".repeat(40),
  },
) =>
  new Request("https://void-agent.test/api/workflow/workflow_123/execute", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "user-1", email: "user@example.test" },
  });
  mocks.ensureN8nUser.mockResolvedValue({
    email: "n8n-user@example.test",
    password: "opaque",
  });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.getWorkflow.mockResolvedValue({ id: "workflow_123" });
  mocks.getWorkflowDefinition.mockResolvedValue(workflowDefinition);
  mocks.consume.mockResolvedValue(true);
  mocks.runWorkflow.mockResolvedValue({ executionId: "run-1" });
});

describe("POST /api/workflow/[id]/execute", () => {
  it("checks the current user's n8n access before running and avoids caching the result", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getWorkflowDefinition).toHaveBeenCalledWith("workflow_123");
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.runWorkflow).toHaveBeenCalledWith("workflow_123", undefined);
    expect(mocks.checkApiRateLimit).toHaveBeenCalledWith({
      kind: "n8n-workflow-execute",
      id: "user-1",
      limit: 10,
      windowMs: 60_000,
    });
  });

  it("rejects missing sessions, cross-origin requests, malformed IDs, and rate-limited calls", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await POST(request("https://attacker.test"), context)).status).toBe(
      403,
    );
    expect(
      (await POST(request(), { params: Promise.resolve({ id: "../other" }) }))
        .status,
    ).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request(), context)).status).toBe(429);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("does not run an inaccessible workflow", async () => {
    mocks.getWorkflowDefinition.mockRejectedValue(
      new Error("private workflow"),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "Could not run workflow" });
  });

  it("rejects missing, mismatched, and replayed approvals before execution", async () => {
    expect(
      (await POST(request("https://void-agent.test", {}), context)).status,
    ).toBe(403);
    const stale = await POST(
      request("https://void-agent.test", {
        query: {},
        workflowName: "Test workflow",
        graphRevision: "b".repeat(64),
        approvalToken: "x".repeat(40),
      }),
      context,
    );
    expect(stale.status).toBe(409);
    mocks.consume.mockResolvedValue(false);
    const replay = await POST(request(), context);
    expect(replay.status).toBe(403);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("forwards reviewed JSON input to the workflow's manual trigger", async () => {
    const definition = {
      ...workflowDefinition,
      nodes: [
        {
          id: "start",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          parameters: {},
        },
      ],
    };
    mocks.getWorkflowDefinition.mockResolvedValue(definition);
    const query = { prompt: "hello" };
    const response = await POST(
      request("https://void-agent.test", {
        query,
        workflowName: definition.name,
        graphRevision: getN8nWorkflowRevision(definition),
        approvalToken: "x".repeat(40),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.runWorkflow).toHaveBeenCalledWith("workflow_123", {
      name: "Manual Trigger",
      data: { data: { main: [[{ json: query }]] } },
    });
  });
});
