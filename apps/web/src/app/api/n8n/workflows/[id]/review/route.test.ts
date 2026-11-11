import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  ensureN8nUser: vi.fn(),
  getWorkflowDefinition: vi.fn(),
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
      credentials: { httpBasicAuth: { id: "secret-id", name: "private" } },
    },
  ],
  connections: {},
  settings: {},
};

const request = (origin = "https://app.example") =>
  new NextRequest("https://app.example/api/n8n/workflows/workflow_123/review", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
const context = { params: Promise.resolve({ id: "workflow_123" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "user-1", email: "user@example.test" },
  });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.ensureN8nUser.mockResolvedValue({
    email: "n8n@example.test",
    password: "private-password",
  });
  mocks.getWorkflowDefinition.mockResolvedValue(workflow);
});

describe("POST /api/n8n/workflows/[id]/review", () => {
  it("returns a no-store sanitized preview for the authenticated user's workflow", async () => {
    const response = await POST(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.reviewable).toBe(true);
    expect(body.effects[0]).toContain(
      "HTTP POST https://api.example.test/action",
    );
    expect(JSON.stringify(body)).not.toContain("secret-id");
    expect(JSON.stringify(body)).not.toContain("private-password");
    expect(mocks.getWorkflowDefinition).toHaveBeenCalledWith("workflow_123");
  });

  it("rejects missing session, cross-origin requests, and invalid IDs", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (await POST(request("https://attacker.example"), context)).status,
    ).toBe(403);
    expect(
      (await POST(request(), { params: Promise.resolve({ id: "../private" }) }))
        .status,
    ).toBe(400);
    expect(mocks.getWorkflowDefinition).not.toHaveBeenCalled();
  });

  it("fails closed for unreviewable workflows without exposing parameter secrets", async () => {
    mocks.getWorkflowDefinition.mockResolvedValue({
      ...workflow,
      nodes: [
        {
          id: "bad",
          name: "Dynamic action",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            url: "https://api.example.test/{{ $json.destination }}",
            body: { apiKey: "do-not-expose" },
          },
        },
      ],
    });
    const response = await POST(request(), context);
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.reviewable).toBe(false);
    expect(JSON.stringify(body)).not.toContain("do-not-expose");
  });

  it("maps n8n service failures to a generic response", async () => {
    mocks.getWorkflowDefinition.mockRejectedValue(
      new Error("private host or secret"),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not inspect n8n workflow",
    });
  });
});
