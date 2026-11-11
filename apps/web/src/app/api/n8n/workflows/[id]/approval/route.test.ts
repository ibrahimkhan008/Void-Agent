import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  ensureN8nUser: vi.fn(),
  getWorkflowDefinition: vi.fn(),
  issue: vi.fn(),
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
  }),
}));
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({
  workflowRunApprovalRepository: { issue: mocks.issue },
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
      name: "Call endpoint",
      type: "n8n-nodes-base.httpRequest",
      parameters: { method: "POST", url: "https://api.example.test/action" },
    },
  ],
  connections: {},
  settings: {},
};
const payload = { recordId: "r-123" };
const body = {
  workflowName: workflow.name,
  graphRevision: getN8nWorkflowRevision(workflow),
  payload,
};
const request = (value: unknown = body, origin = "https://app.example") =>
  new NextRequest(
    "https://app.example/api/n8n/workflows/workflow_123/approval",
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
  mocks.issue.mockResolvedValue("a".repeat(43));
});

describe("POST /api/n8n/workflows/[id]/approval", () => {
  it("issues a single-use approval bound to user, target, revision, and payload", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "a".repeat(43) });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", {
      platform: "n8n",
      target: "workflow_123",
      ...body,
    });
  });

  it("refuses changed or unreviewable workflows without issuing an approval", async () => {
    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      name: "Changed",
    });
    expect((await POST(request(), context)).status).toBe(409);

    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      nodes: [
        {
          id: "unsafe",
          name: "Send mail",
          type: "n8n-nodes-base.gmail",
          parameters: {},
        },
      ],
    });
    const staleBody = {
      ...body,
      graphRevision: getN8nWorkflowRevision({
        ...workflow,
        nodes: [
          {
            id: "unsafe",
            name: "Send mail",
            type: "n8n-nodes-base.gmail",
            parameters: {},
          },
        ],
      } as never),
    };
    expect((await POST(request(staleBody), context)).status).toBe(422);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and malformed payloads before calling n8n", async () => {
    expect(
      (await POST(request(body, "https://attacker.example"), context)).status,
    ).toBe(403);
    const invalid = await POST(request({ ...body, extra: "field" }), context);
    expect(invalid.status).toBe(400);
    expect(mocks.getWorkflowDefinition).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
