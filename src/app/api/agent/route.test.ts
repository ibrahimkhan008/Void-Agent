import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canCreateAgent: vi.fn(),
  insertApprovedAgentIdempotently: vi.fn(),
  insertAgent: vi.fn(),
  cacheDelete: vi.fn(),
  isEnabledAgentModel: vi.fn(),
  ConflictError: class AgentApprovalIdempotencyConflictError extends Error {},
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canCreateAgent: mocks.canCreateAgent,
}));
vi.mock("lib/ai/agent/pinned-model", () => ({
  isEnabledAgentModel: mocks.isEnabledAgentModel,
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: { insertAgent: mocks.insertAgent },
}));
vi.mock("lib/cache", () => ({ serverCache: { delete: mocks.cacheDelete } }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { agentInstructions: (...args: string[]) => args.join(":") },
}));
vi.mock("lib/db/pg/repositories/agent-repository.pg", () => {
  return {
    AgentApprovalIdempotencyConflictError: mocks.ConflictError,
    insertApprovedAgentIdempotently: mocks.insertApprovedAgentIdempotently,
  };
});

import { POST } from "./route";

const payload = {
  userId: "attacker-controlled-id",
  name: "Research helper",
  instructions: { systemPrompt: "Use primary sources." },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "authenticated-user" } });
  mocks.canCreateAgent.mockResolvedValue(true);
  mocks.isEnabledAgentModel.mockResolvedValue(true);
  mocks.insertApprovedAgentIdempotently.mockResolvedValue({
    agent: { id: "agent-id", name: "Research helper" },
    replayed: false,
  });
});

describe("POST /api/agent approval idempotency", () => {
  it("uses the authenticated owner and returns the replay state", async () => {
    const request = new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "toolcall_abc123",
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Idempotency-Replayed")).toBe("false");
    expect(mocks.insertApprovedAgentIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "authenticated-user" }),
      "toolcall_abc123",
      expect.any(String),
    );
  });

  it("rejects malformed keys before writing", async () => {
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "bad key",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.insertApprovedAgentIdempotently).not.toHaveBeenCalled();
  });

  it("rejects stale or disabled pinned models before writing the agent", async () => {
    mocks.isEnabledAgentModel.mockResolvedValue(false);
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "toolcall_abc123",
        },
        body: JSON.stringify({
          ...payload,
          instructions: {
            ...payload.instructions,
            model: "old-provider/deleted-model",
          },
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.insertApprovedAgentIdempotently).not.toHaveBeenCalled();
  });

  it("does not permit approval writes without the existing agent permission", async () => {
    mocks.canCreateAgent.mockResolvedValue(false);
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "toolcall_abc123",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.insertApprovedAgentIdempotently).not.toHaveBeenCalled();
  });

  it("rejects reuse of a key with a different approved payload", async () => {
    mocks.insertApprovedAgentIdempotently.mockRejectedValue(
      new mocks.ConflictError(),
    );
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "toolcall_abc123",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(409);
  });
});
