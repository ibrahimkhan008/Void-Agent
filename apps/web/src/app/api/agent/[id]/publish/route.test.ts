import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishAgent: vi.fn(),
  unpublishAgent: vi.fn(),
  getAgentPublicationStatus: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: Request, ...args: any[]) =>
      handler(request, { user: { id: "user-1" } }, ...args),
}));
vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    publishAgent: mocks.publishAgent,
    unpublishAgent: mocks.unpublishAgent,
    getAgentPublicationStatus: mocks.getAgentPublicationStatus,
  },
}));

import { DELETE, POST } from "./route";

const context = { params: Promise.resolve({ id: "agent-1" }) };

function request(method: "POST" | "DELETE") {
  return new Request(`https://void.example/api/agent/agent-1/publish`, {
    method,
  });
}

describe("POST /api/agent/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes an owned shared agent and returns the publication time", async () => {
    const publishedAt = new Date("2026-11-20T10:00:00Z");
    mocks.publishAgent.mockResolvedValue({
      publishedAt,
      visibility: "public",
    });

    const response = await POST(request("POST") as never, context);

    expect(response.status).toBe(200);
    expect(mocks.publishAgent).toHaveBeenCalledWith("user-1", "agent-1");
    // Response.json serializes the timestamp — assert the ISO string.
    expect(await response.json()).toEqual({
      publishedAt: "2026-11-20T10:00:00.000Z",
    });
  });

  it("404s for an agent that is not the caller's", async () => {
    mocks.publishAgent.mockResolvedValue(null);
    mocks.getAgentPublicationStatus.mockResolvedValue(null);

    const response = await POST(request("POST") as never, context);

    expect(response.status).toBe(404);
  });

  it("409s with guidance when the agent is still private", async () => {
    // The UPDATE's WHERE enforces Public/Readonly — a private agent never
    // publishes, even racing a visibility change.
    mocks.publishAgent.mockResolvedValue(null);
    mocks.getAgentPublicationStatus.mockResolvedValue({
      publishedAt: null,
      visibility: "private",
    });

    const response = await POST(request("POST") as never, context);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/Public or Readonly/i);
  });
});

describe("DELETE /api/agent/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unpublishes the owner's agent", async () => {
    mocks.unpublishAgent.mockResolvedValue(true);

    const response = await DELETE(request("DELETE") as never, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publishedAt: null });
    expect(mocks.unpublishAgent).toHaveBeenCalledWith("user-1", "agent-1");
  });

  it("404s when there is no owned agent to unpublish", async () => {
    mocks.unpublishAgent.mockResolvedValue(false);

    const response = await DELETE(request("DELETE") as never, context);

    expect(response.status).toBe(404);
  });
});
