import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectMessage: vi.fn(),
  selectThread: vi.fn(),
  upsertMessage: vi.fn(),
  upsertThread: vi.fn(),
  rateLimit: vi.fn(),
  preview: vi.fn(),
  hasSameOrigin: vi.fn(),
  listProjectsForUser: vi.fn(),
  getProjectAccess: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectMessage: mocks.selectMessage,
    selectThread: mocks.selectThread,
    upsertMessage: mocks.upsertMessage,
    upsertThread: mocks.upsertThread,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/projects/access", () => ({
  listProjectsForUser: mocks.listProjectsForUser,
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/voice/transcript-preview", () => ({
  previewVoiceTranscript: mocks.preview,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const preview = {
  intent: "task",
  title: "Summarize notes",
  summary: "The transcript asks for a summary.",
  suggestedProjectId: null,
};

function request(body: unknown = { messageId }) {
  return new Request("https://app.test/api/voice/transcript/preview", {
    method: "POST",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voice/transcript/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "Summarize my notes" }],
      metadata: { source: "voice_device" },
    });
    mocks.selectThread.mockResolvedValue({ id: threadId, userId });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.preview.mockResolvedValue(preview);
    mocks.listProjectsForUser.mockResolvedValue([]);
    mocks.getProjectAccess.mockResolvedValue({ role: "owner" });
  });

  it("rejects a transcript whose thread belongs to another user", async () => {
    mocks.selectThread.mockResolvedValue({ id: threadId, userId: otherUserId });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.upsertMessage).not.toHaveBeenCalled();
    expect(mocks.upsertThread).not.toHaveBeenCalled();
  });

  it("rejects non-device messages without exposing their content", async () => {
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "private typed message" }],
      metadata: { source: "chat" },
    });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("returns a preview for an owned saved transcript without writing or executing tools", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      preview,
      suggestedProject: null,
    });
    expect(mocks.preview).toHaveBeenCalledWith("Summarize my notes", []);
    expect(mocks.upsertMessage).not.toHaveBeenCalled();
    expect(mocks.upsertThread).not.toHaveBeenCalled();
    expect(mocks.selectMessage).toHaveBeenCalledWith(messageId);
    expect(mocks.selectThread).toHaveBeenCalledWith(threadId);
  });

  it("previews an owned saved browser voice transcript", async () => {
    mocks.selectMessage.mockResolvedValue({
      id: messageId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "Summarize my notes" }],
      metadata: { source: "voice_realtime", voiceSessionId: "session-1" },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith("Summarize my notes", []);
    expect(mocks.upsertMessage).not.toHaveBeenCalled();
    expect(mocks.upsertThread).not.toHaveBeenCalled();
  });

  it("limits project suggestions to the signed-in user's authorized project list", async () => {
    const projectId = "00000000-0000-4000-8000-000000000005";
    mocks.listProjectsForUser.mockResolvedValue([
      { id: projectId, name: "Launch", description: "Launch planning" },
    ]);
    mocks.preview.mockResolvedValue({
      ...preview,
      suggestedProjectId: projectId,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      preview: { ...preview, suggestedProjectId: projectId },
      suggestedProject: { id: projectId, name: "Launch" },
    });
    expect(mocks.preview).toHaveBeenCalledWith("Summarize my notes", [
      { id: projectId, name: "Launch", description: "Launch planning" },
    ]);
  });

  it("does not surface projects where the caller has view-only access", async () => {
    const projectId = "00000000-0000-4000-8000-000000000005";
    mocks.listProjectsForUser.mockResolvedValue([
      { id: projectId, name: "Read only", description: null },
    ]);
    mocks.getProjectAccess.mockResolvedValue({ role: "viewer" });
    mocks.preview.mockResolvedValue({
      ...preview,
      suggestedProjectId: projectId,
    });

    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      preview: { suggestedProjectId: null },
      suggestedProject: null,
    });
    expect(mocks.preview).toHaveBeenCalledWith("Summarize my notes", []);
  });

  it("accepts only the message ID and enforces origin and rate limits", async () => {
    expect(
      (await POST(request({ messageId, text: "client text" }))).status,
    ).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();

    mocks.hasSameOrigin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.selectMessage).not.toHaveBeenCalled();

    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.selectMessage).not.toHaveBeenCalled();
  });
});
