import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectMessage: vi.fn(),
  selectThread: vi.fn(),
  updateThread: vi.fn(),
  getProjectAccess: vi.fn(),
  rateLimit: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectMessage: mocks.selectMessage,
    selectThread: mocks.selectThread,
    updateThread: mocks.updateThread,
  },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));

import { PATCH } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const projectId = "00000000-0000-4000-8000-000000000005";

function request(body: unknown = { messageId, projectId }) {
  return new Request("https://app.test/api/voice/transcript/project", {
    method: "PATCH",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/voice/transcript/project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "Remember the launch date" }],
      metadata: { source: "voice_device" },
    });
    mocks.selectThread.mockResolvedValue({ id: threadId, userId });
    mocks.updateThread.mockResolvedValue({ id: threadId, projectId });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, name: "Launch" },
      role: "editor",
    });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.hasSameOrigin.mockReturnValue(true);
  });

  it("moves an owned device transcript only after explicit authenticated selection", async () => {
    const response = await PATCH(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      ok: true,
      threadId,
      project: { id: projectId, name: "Launch" },
    });
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(projectId, userId);
    expect(mocks.updateThread).toHaveBeenCalledWith(threadId, { projectId });
  });

  it("does not move a thread when the transcript belongs to another user", async () => {
    mocks.selectThread.mockResolvedValue({ id: threadId, userId: otherUserId });
    const response = await PATCH(request());
    expect(response.status).toBe(404);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
    expect(mocks.updateThread).not.toHaveBeenCalled();
  });

  it("accepts only saved device transcripts, not arbitrary chat messages", async () => {
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "typed note" }],
      metadata: { source: "chat" },
    });
    const response = await PATCH(request());
    expect(response.status).toBe(404);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
    expect(mocks.updateThread).not.toHaveBeenCalled();
  });

  it("supports saved browser voice turns through the same explicit review assignment", async () => {
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "Remember the launch date" }],
      metadata: { source: "voice_realtime" },
    });
    const response = await PATCH(request());
    expect(response.status).toBe(200);
    expect(mocks.updateThread).toHaveBeenCalledWith(threadId, { projectId });
  });

  it("requires a currently editable project and same-origin request", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, name: "Read only" },
      role: "viewer",
    });
    expect((await PATCH(request())).status).toBe(404);
    expect(mocks.updateThread).not.toHaveBeenCalled();

    mocks.hasSameOrigin.mockReturnValue(false);
    expect((await PATCH(request())).status).toBe(403);
    expect(mocks.selectMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed, oversized and over-limit requests before database writes", async () => {
    expect(
      (await PATCH(request({ messageId, projectId, text: "ignored" }))).status,
    ).toBe(400);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await PATCH(request())).status).toBe(429);
    expect(mocks.selectMessage).not.toHaveBeenCalled();

    const huge = new Request("https://app.test/api/voice/transcript/project", {
      method: "PATCH",
      headers: {
        Origin: "https://app.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messageId,
        projectId,
        padding: "x".repeat(2_000),
      }),
    });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    expect((await PATCH(huge)).status).toBe(413);
    expect(mocks.updateThread).not.toHaveBeenCalled();
  });
});
