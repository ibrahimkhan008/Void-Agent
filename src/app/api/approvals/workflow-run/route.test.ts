import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  issue: vi.fn(),
  selectExecuteAbility: vi.fn(),
  selectStructureById: vi.fn(),
  selectAllForUser: vi.fn(),
  ensureN8nUser: vi.fn(),
  getWorkflowDefinition: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({
  workflowRunApprovalRepository: { issue: mocks.issue },
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectExecuteAbility: mocks.selectExecuteAbility,
    selectStructureById: mocks.selectStructureById,
  },
  mcpRepository: { selectAllForUser: mocks.selectAllForUser },
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/n8n/provision", () => ({ ensureN8nUser: mocks.ensureN8nUser }));
vi.mock("lib/n8n/client", () => ({
  createUserClient: () => ({
    getWorkflowDefinition: mocks.getWorkflowDefinition,
  }),
}));

import { POST } from "./route";

const payload = {
  platform: "windmill",
  target: "u/team/deploy",
  payload: { version: "1.2" },
};
const request = (body: unknown = payload, origin = "https://void-agent.test") =>
  new Request("https://void-agent.test/api/approvals/workflow-run", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-workflow-token");
  mocks.selectExecuteAbility.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000001", name: "Approved workflow" },
  ]);
  mocks.selectStructureById.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Approved workflow",
    isPublished: true,
    nodes: [],
    edges: [],
  });
  mocks.selectAllForUser.mockResolvedValue([]);
  mocks.ensureN8nUser.mockResolvedValue({
    email: "n8n@example.test",
    password: "secret",
  });
  mocks.getWorkflowDefinition.mockResolvedValue({
    id: "workflow_123",
    name: "n8n demo",
    nodes: [
      {
        id: "1",
        name: "Call API",
        type: "n8n-nodes-base.httpRequest",
        parameters: { url: "https://api.example.test/path?token=secret" },
      },
    ],
    connections: {},
    settings: {},
  });
});

describe("POST /api/approvals/workflow-run", () => {
  it("issues a no-store user-bound token for an exact target and payload", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      approvalToken: "opaque-workflow-token",
    });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects unauthenticated, cross-origin and invalid requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(
      403,
    );
    expect(
      (await POST(request({ ...payload, target: "bad\npath" }))).status,
    ).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("issues saved-workflow approvals only for a workflow currently executable by this user", async () => {
    const savedWorkflow = {
      platform: "saved-workflow",
      target: "00000000-0000-4000-8000-000000000001",
      workflowName: "Approved workflow",
      approvalTokenField: "voidAgentWorkflowApprovalToken",
      graphRevision: "0".repeat(64),
      payload: { customerId: "42" },
    };
    const { getWorkflowGraphRevision } = await import(
      "lib/ai/workflow/workflow-review"
    );
    savedWorkflow.graphRevision = getWorkflowGraphRevision([], []);
    const response = await POST(request(savedWorkflow));
    expect(response.status).toBe(200);
    expect(mocks.selectExecuteAbility).toHaveBeenCalledWith("user-1");
    expect(mocks.issue).toHaveBeenCalledWith("user-1", savedWorkflow);

    const changed = await POST(
      request({ ...savedWorkflow, graphRevision: "f".repeat(64) }),
    );
    expect(changed.status).toBe(409);

    mocks.selectExecuteAbility.mockResolvedValue([]);
    const denied = await POST(request(savedWorkflow));
    expect(denied.status).toBe(404);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded safe n8n effect summary and issues revision-bound approval", async () => {
    const preview = await POST(
      request({ previewN8nWorkflowId: "workflow_123" }),
    );
    expect(preview.status).toBe(200);
    const review = await preview.json();
    expect(review.effects).toEqual([
      "Call API: action or integration (n8n-nodes-base.httpRequest) to api.example.test",
    ]);
    expect(JSON.stringify(review)).not.toContain("secret");
    const approval = {
      platform: "n8n",
      target: "workflow_123",
      workflowName: "n8n demo",
      graphRevision: review.graphRevision,
      payload: { key: "value" },
    };
    const response = await POST(request(approval));
    expect(response.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledWith("user-1", approval);
  });
});
