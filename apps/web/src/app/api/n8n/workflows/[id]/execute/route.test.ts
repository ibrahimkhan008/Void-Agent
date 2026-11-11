import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  ensureN8nUser: vi.fn(),
  getWorkflowDefinition: vi.fn(),
  runWorkflow: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (request: Request, ...args: unknown[]) => {
      const session = await mocks.getSession();
      if (!session?.user?.id)
        return new Response("Unauthorized", { status: 401 });
      return handler(request, session, ...args);
    },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/n8n/provision", () => ({ ensureN8nUser: mocks.ensureN8nUser }));
vi.mock("lib/n8n/client", () => ({
  N8nError: class N8nError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createUserClient: () => ({
    getWorkflowDefinition: mocks.getWorkflowDefinition,
    runWorkflow: mocks.runWorkflow,
  }),
}));
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({
  workflowRunApprovalRepository: { consume: mocks.consume },
}));

import { getN8nWorkflowRevision } from "lib/n8n/workflow-review";
import { POST } from "./route";

const workflow = {
  id: "workflow_123",
  name: "Review me",
  active: false,
  description: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  nodes: [
    {
      id: "node-1",
      name: "Manual start",
      type: "n8n-nodes-base.manualTrigger",
      parameters: {},
    },
    {
      id: "node-2",
      name: "Call endpoint",
      type: "n8n-nodes-base.httpRequest",
      parameters: { method: "POST", url: "https://api.example.test/action" },
    },
  ],
  connections: {},
  settings: {},
};
const payload = { recordId: "r-123" };
const approvalToken = "a".repeat(43);
const body = () => ({
  workflowName: workflow.name,
  graphRevision: getN8nWorkflowRevision(workflow),
  payload,
  approvalToken,
});
const request = (value: unknown = body(), origin = "https://app.example") =>
  new NextRequest(
    "https://app.example/api/n8n/workflows/workflow_123/execute",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(value),
    },
  );
const context = { params: Promise.resolve({ id: "workflow_123" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "user-1", email: "user@example.test" },
  });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.ensureN8nUser.mockResolvedValue({
    email: "n8n@example.test",
    password: "secret",
  });
  mocks.getWorkflowDefinition.mockResolvedValue(workflow);
  mocks.consume.mockResolvedValue(true);
  mocks.runWorkflow.mockResolvedValue({
    data: { executionId: "execution-1", resultData: { secret: "no-return" } },
  });
});

describe("POST /api/n8n/workflows/[id]/execute", () => {
  it("rechecks the definition, consumes the one-time approval, and returns only an acknowledgement", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      executionId: "execution-1",
    });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", approvalToken, {
      platform: "n8n",
      target: "workflow_123",
      workflowName: workflow.name,
      graphRevision: getN8nWorkflowRevision(workflow),
      payload,
    });
    expect(mocks.runWorkflow).toHaveBeenCalledWith("workflow_123", {
      name: "Manual start",
      data: { data: { main: [[{ json: payload }]] } },
    });
  });

  it("rejects changed definitions and replayed approvals before running", async () => {
    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      name: "Changed",
    });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.consume).not.toHaveBeenCalled();

    mocks.getWorkflowDefinition.mockResolvedValue(workflow);
    mocks.consume.mockResolvedValue(false);
    expect((await POST(request(), context)).status).toBe(403);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("requires a manual trigger for nonempty input and enforces same-origin auth", async () => {
    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      nodes: workflow.nodes.slice(1),
    });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(
      (await POST(request(body(), "https://attacker.example"), context)).status,
    ).toBe(403);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed when the reviewed action is no longer reviewable", async () => {
    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      nodes: [
        {
          id: "node-1",
          name: "Unsupported",
          type: "n8n-nodes-base.gmail",
          parameters: {},
        },
      ],
    });
    const bodyWithCurrentRevision = {
      ...body(),
      graphRevision: getN8nWorkflowRevision({
        ...workflow,
        nodes: [
          {
            id: "node-1",
            name: "Unsupported",
            type: "n8n-nodes-base.gmail",
            parameters: {},
          },
        ],
      } as never),
      payload: {},
    };
    expect((await POST(request(bodyWithCurrentRevision), context)).status).toBe(
      422,
    );
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
