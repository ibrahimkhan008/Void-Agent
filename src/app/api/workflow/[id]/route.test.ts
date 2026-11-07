import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureN8nUser: vi.fn(),
  updateWorkflow: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/n8n/provision", () => ({ ensureN8nUser: mocks.ensureN8nUser }));
vi.mock("lib/n8n/client", () => ({
  createUserClient: () => ({ updateWorkflow: mocks.updateWorkflow }),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));

import { PUT } from "./route";

const context = { params: Promise.resolve({ id: "workflow_123" }) };
const request = (body: unknown, origin = "https://void-agent.test") =>
  new Request("https://void-agent.test/api/workflow/workflow_123", {
    method: "PUT",
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
  mocks.updateWorkflow.mockResolvedValue({ id: "workflow_123", active: false });
});

describe("PUT /api/workflow/[id]", () => {
  it("allows same-origin deactivation", async () => {
    const response = await PUT(request({ active: false }), context);
    expect(response.status).toBe(200);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith("workflow_123", {
      active: false,
    });
  });

  it("rejects activation and other mutations without invoking n8n", async () => {
    expect((await PUT(request({ active: true }), context)).status).toBe(403);
    expect(
      (await PUT(request({ active: false, name: "renamed" }), context)).status,
    ).toBe(403);
    expect(mocks.updateWorkflow).not.toHaveBeenCalled();
  });

  it("requires a user session, same origin, a valid ID, and rate limit capacity", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PUT(request({ active: false }), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (await PUT(request({ active: false }, "https://attacker.test"), context))
        .status,
    ).toBe(403);
    expect(
      (
        await PUT(request({ active: false }), {
          params: Promise.resolve({ id: "../other" }),
        })
      ).status,
    ).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await PUT(request({ active: false }), context)).status).toBe(429);
    expect(mocks.updateWorkflow).not.toHaveBeenCalled();
  });
});
