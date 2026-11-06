import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  selectThread: vi.fn(),
  upsertThread: vi.fn(),
  upsertMessage: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rateLimit }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectThread: mocks.selectThread,
    upsertThread: mocks.upsertThread,
    upsertMessage: mocks.upsertMessage,
  },
}));

import { POST } from "./route";

const threadId = "b8f4eb38-02c2-4e5d-9f34-59af27caef34";
const userId = "45e33e49-9080-4e63-a03f-9b59dd7d19c7";

const request = (body: unknown) => new Request("https://local.test/api/voice/session-thread", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/voice/session-thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.selectThread.mockResolvedValue(null);
    mocks.upsertThread.mockResolvedValue({ id: threadId, userId });
    mocks.upsertMessage.mockResolvedValue({});
  });

  it("requires a signed-in user", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
  });

  it("rejects a client-selected thread owned by another user", async () => {
    mocks.selectThread.mockResolvedValue({ id: threadId, userId: "another-user" });
    const response = await POST(request({ threadId, voiceSessionId: "voice-1", turns: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }] }));
    expect(response.status).toBe(403);
    expect(mocks.upsertThread).not.toHaveBeenCalled();
    expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });

  it("creates an owned thread and idempotently upserts voice turns", async () => {
    const response = await POST(request({ threadId, voiceSessionId: "voice-1", turns: [
      { id: "message-1", role: "user", parts: [{ type: "text", text: "Find my schedule" }] },
      { id: "message-2", role: "assistant", parts: [{ type: "text", text: "I found it" }] },
    ] }));
    expect(response.status).toBe(200);
    expect(mocks.upsertThread).toHaveBeenCalledWith({ id: threadId, userId, title: "Find my schedule" });
    expect(mocks.upsertMessage).toHaveBeenCalledTimes(2);
    expect(mocks.upsertMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: `${threadId}:message-1`,
      threadId,
      role: "user",
      metadata: { source: "voice_realtime", voiceSessionId: "voice-1" },
    }));
  });
});
