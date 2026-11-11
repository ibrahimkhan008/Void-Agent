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
        parameters: {
          method: "POST",
          url: "https://api.example.test/path",
          jsonBody: '{"operation":"archive"}',
        },
        credentials: {
          httpBasicAuth: { id: "secret-credential-id", name: "secret name" },
        },
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
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request([]))).status).toBe(400);
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

  it("does not issue approval for effects whose runtime arguments cannot be previewed", async () => {
    const workflow = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Approved workflow",
      isPublished: true,
      nodes: [
        {
          id: "http",
          name: "Dynamic HTTP",
          kind: "http",
          nodeConfig: {
            method: "POST",
            url: { nodeId: "input", path: ["url"] },
            headers: [],
            query: [],
            body: { nodeId: "input", path: ["body"] },
          },
        },
      ],
      edges: [],
    };
    mocks.selectExecuteAbility.mockResolvedValue([
      { id: workflow.id, name: workflow.name },
    ]);
    mocks.selectStructureById.mockResolvedValue(workflow);
    const { getWorkflowGraphRevision } = await import(
      "lib/ai/workflow/workflow-review"
    );
    const graphRevision = getWorkflowGraphRevision(
      workflow.nodes,
      workflow.edges,
    );
    const approval = {
      platform: "saved-workflow",
      target: workflow.id,
      workflowName: workflow.name,
      approvalTokenField: "voidAgentWorkflowApprovalToken",
      graphRevision,
      payload: { url: "https://api.example.test", body: "delete" },
    };
    const preview = await POST(
      request({ previewWorkflowId: workflow.id, workflowName: workflow.name }),
    );
    const review = await preview.json();
    expect(review.reviewable).toBe(false);
    expect(review.issues).toHaveLength(1);
    const response = await POST(request(approval));
    expect(response.status).toBe(422);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("does not expose or approve literal credential-bearing HTTP definitions", async () => {
    const workflow = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Credential-bearing workflow",
      isPublished: true,
      nodes: [
        {
          id: "http",
          name: "Send request",
          kind: "http",
          nodeConfig: {
            method: "POST",
            url: "https://api.example.test?api_token=url-secret",
            headers: [{ key: "Authorization", value: "Bearer header-secret" }],
            query: [],
            body: '{"password":"body-secret"}',
          },
        },
      ],
      edges: [],
    };
    mocks.selectExecuteAbility.mockResolvedValue([
      { id: workflow.id, name: workflow.name },
    ]);
    mocks.selectStructureById.mockResolvedValue(workflow);
    const { getWorkflowGraphRevision } = await import(
      "lib/ai/workflow/workflow-review"
    );
    const approval = {
      platform: "saved-workflow",
      target: workflow.id,
      workflowName: workflow.name,
      approvalTokenField: "voidAgentWorkflowApprovalToken",
      graphRevision: getWorkflowGraphRevision(workflow.nodes, workflow.edges),
      payload: {},
    };

    const previewResponse = await POST(
      request({ previewWorkflowId: workflow.id, workflowName: workflow.name }),
    );
    const preview = await previewResponse.json();
    expect(previewResponse.status).toBe(200);
    expect(preview.reviewable).toBe(false);
    expect(preview.effects).toEqual([]);
    for (const secret of ["url-secret", "header-secret", "body-secret"])
      expect(JSON.stringify(preview)).not.toContain(secret);

    const approvalResponse = await POST(request(approval));
    expect(approvalResponse.status).toBe(422);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("returns the exact sanitized n8n effect preview and issues revision-bound approval", async () => {
    const preview = await POST(
      request({ previewN8nWorkflowId: "workflow_123" }),
    );
    expect(preview.status).toBe(200);
    const review = await preview.json();
    expect(review.reviewable).toBe(true);
    expect(review.effects).toHaveLength(1);
    expect(review.effects[0]).toContain(
      "HTTP POST https://api.example.test/path",
    );
    expect(review.effects[0]).toContain("archive");
    expect(review.effects[0]).toContain("httpBasicAuth: [configured]");
    expect(JSON.stringify(review)).not.toContain("secret-credential-id");
    expect(JSON.stringify(review)).not.toContain("secret name");
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

  it("fails closed for dynamic or credential-bearing n8n effects and never issues a token", async () => {
    const unsafeWorkflow = {
      id: "workflow_123",
      name: "n8n demo",
      nodes: [
        {
          id: "1",
          name: "Dynamic request",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            method: "POST",
            url: "https://api.example.test/path",
            headerParameters: {
              parameters: [{ name: "apiKey", value: "raw-secret-value" }],
            },
            jsonBody: '{"password":"body-secret-value"}',
          },
        },
      ],
      connections: {},
      settings: {},
    };
    mocks.getWorkflowDefinition.mockResolvedValue(unsafeWorkflow);
    const preview = await POST(
      request({ previewN8nWorkflowId: "workflow_123" }),
    );
    expect(preview.status).toBe(422);
    const previewBody = await preview.json();
    expect(previewBody.reviewable).toBe(false);
    expect(previewBody.effects).toEqual([]);
    expect(JSON.stringify(previewBody)).not.toContain("raw-secret-value");
    expect(JSON.stringify(previewBody)).not.toContain("body-secret-value");

    const { getN8nWorkflowRevision } = await import("lib/n8n/workflow-review");
    const approval = {
      platform: "n8n",
      target: "workflow_123",
      workflowName: unsafeWorkflow.name,
      graphRevision: getN8nWorkflowRevision(unsafeWorkflow as never),
      payload: {},
    };
    const response = await POST(request(approval));
    expect(response.status).toBe(422);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
