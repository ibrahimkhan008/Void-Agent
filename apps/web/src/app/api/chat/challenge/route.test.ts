import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveChatSession: vi.fn(),
  createChatChallenge: vi.fn(),
  resolveChatSecuritySessionId: vi.fn(() => "session-1"),
  resolveChatSecuritySessionIpAddress: vi.fn(() => "203.0.113.7"),
  resolveChatSecuritySessionUserAgent: vi.fn(() => "browser-agent"),
}));

vi.mock("../route-helpers", () => ({
  resolveChatSession: mocks.resolveChatSession,
}));
vi.mock("@/lib/security/chat-request-guard.server", () => ({
  createChatChallenge: mocks.createChatChallenge,
  resolveChatSecuritySessionId: mocks.resolveChatSecuritySessionId,
  resolveChatSecuritySessionIpAddress:
    mocks.resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionUserAgent:
    mocks.resolveChatSecuritySessionUserAgent,
}));

import { POST } from "./route";

function makeRequest(body: string, headers: HeadersInit = {}) {
  return new Request("https://void-agent.test/api/chat/challenge", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveChatSession.mockResolvedValue({
    session: { user: { id: "owner-1" }, session: { id: "session-1" } },
    headless: false,
    runMode: "interactive",
    scheduledTaskId: null,
  });
  mocks.createChatChallenge.mockResolvedValue({
    ok: true,
    data: { enabled: true, challengeId: "challenge-123456" },
  });
});

describe("POST /api/chat/challenge", () => {
  it("rejects unauthenticated callers before parsing or issuing a challenge", async () => {
    mocks.resolveChatSession.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const response = await POST(makeRequest("{not-json"));

    expect(response.status).toBe(401);
    expect(mocks.createChatChallenge).not.toHaveBeenCalled();
  });

  it("does not issue browser challenges to headless scheduled sessions", async () => {
    mocks.resolveChatSession.mockResolvedValue({
      session: { user: { id: "owner-1" }, session: { id: "task-session" } },
      headless: true,
      runMode: "unattended",
      scheduledTaskId: "task-1",
    });

    const response = await POST(
      makeRequest(
        JSON.stringify({
          clientId: "client-1234567890123456",
          clientPublicKey: "k".repeat(100),
        }),
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.createChatChallenge).not.toHaveBeenCalled();
  });

  it("rejects oversized and malformed challenge bodies", async () => {
    const oversized = await POST(makeRequest("x".repeat(2_049)));
    expect(oversized.status).toBe(413);

    const malformed = await POST(makeRequest("{not-json"));
    expect(malformed.status).toBe(400);
    expect(mocks.createChatChallenge).not.toHaveBeenCalled();
  });

  it("validates the client binding and invokes challenge creation with the authenticated session", async () => {
    const body = {
      clientId: "client-1234567890123456",
      clientPublicKey: "A".repeat(120),
    };
    const response = await POST(makeRequest(JSON.stringify(body)));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.createChatChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        sessionId: "session-1",
        sessionIpAddress: "203.0.113.7",
        sessionUserAgent: "browser-agent",
        clientBinding: body,
      }),
    );
  });

  it("returns guard failures without leaking details beyond the stable response", async () => {
    mocks.createChatChallenge.mockResolvedValue({
      ok: false,
      status: 403,
      code: "invalid-origin",
      message: "Invalid request origin.",
    });

    const response = await POST(
      makeRequest(
        JSON.stringify({
          clientId: "client-1234567890123456",
          clientPublicKey: "A".repeat(120),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "invalid-origin",
      message: "Invalid request origin.",
    });
  });
});
