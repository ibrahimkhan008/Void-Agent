import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  ensureN8nUser: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
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
    updateWorkflow: mocks.updateWorkflow,
    deleteWorkflow: mocks.deleteWorkflow,
  }),
}));

import { DELETE, PATCH } from "./route";

const request = (
  method: string,
  body?: unknown,
  origin = "https://app.example",
) =>
  new NextRequest("https://app.example/api/n8n/workflows/workflow_123", {
    method,
    headers: {
      origin,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    password: "secret",
  });
  mocks.updateWorkflow.mockResolvedValue({ id: "workflow_123" });
  mocks.deleteWorkflow.mockResolvedValue(undefined);
});

describe("n8n workflow management", () => {
  it("allows only deactivation through PATCH", async () => {
    const response = await PATCH(request("PATCH", { active: false }), context);
    expect(response.status).toBe(200);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith("workflow_123", {
      active: false,
    });

    expect(
      (await PATCH(request("PATCH", { active: true }), context)).status,
    ).toBe(400);
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1);
  });

  it("deletes only through the authenticated user's n8n identity", async () => {
    const response = await DELETE(request("DELETE"), context);
    expect(response.status).toBe(200);
    expect(mocks.deleteWorkflow).toHaveBeenCalledWith("workflow_123");
  });

  it("rejects unauthenticated, cross-origin, and invalid-ID requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await DELETE(request("DELETE"), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (
        await PATCH(
          request("PATCH", { active: false }, "https://evil.test"),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await DELETE(request("DELETE"), {
          params: Promise.resolve({ id: "../x" }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.deleteWorkflow).not.toHaveBeenCalled();
  });
});
