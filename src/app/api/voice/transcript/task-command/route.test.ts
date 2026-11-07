import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  selectMessage: vi.fn(),
  selectThread: vi.fn(),
  asanaExecute: vi.fn(),
  clickupExecute: vi.fn(),
  issue: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectMessage: mocks.selectMessage,
    selectThread: mocks.selectThread,
  },
}));
vi.mock("lib/db/pg/repositories/task-creation-approval-repository.pg", () => ({
  taskCreationApprovalRepository: { issue: mocks.issue },
}));
vi.mock("lib/ai/tools/connectors/asana-tool", () => ({
  createAsanaToolForUser: () => ({ execute: mocks.asanaExecute }),
}));
vi.mock("lib/ai/tools/connectors/clickup-tool", () => ({
  createClickUpToolForUser: () => ({ execute: mocks.clickupExecute }),
}));

import { POST } from "./route";

const messageId = "00000000-0000-4000-8000-000000000001";
const payload = {
  action: "execute",
  messageId,
  provider: "asana",
  parentId: "workspace-1",
  targetId: "project-1",
  name: "Review launch",
  details: "Review launch checklist",
  approvalToken: "t".repeat(48),
};
const makeRequest = (body: unknown = payload) =>
  new Request("https://void.test/api/voice/transcript/task-command", {
    method: "POST",
    headers: {
      origin: "https://void.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.sameOrigin.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.selectMessage.mockResolvedValue({
    id: messageId,
    threadId: "thread-1",
    role: "user",
    parts: [{ type: "text", text: "Create a launch review task" }],
    metadata: { source: "voice_device" },
  });
  mocks.selectThread.mockResolvedValue({ userId: "owner-1" });
  mocks.asanaExecute.mockImplementation(
    async (input: Record<string, unknown>) => {
      if (input.action === "list_projects")
        return { projects: [{ gid: "project-1", name: "Launch" }] };
      if (input.action === "create_task") return { data: { gid: "task-1" } };
      return { workspaces: [{ gid: "workspace-1", name: "Main" }] };
    },
  );
  mocks.clickupExecute.mockResolvedValue({ spaces: [] });
  mocks.issue.mockResolvedValue("a".repeat(48));
});

describe("POST /api/voice/transcript/task-command", () => {
  it("requires authentication, same-origin, a valid owned voice transcript, and a rate allowance", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(makeRequest())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await POST(makeRequest())).status).toBe(403);
    mocks.selectThread.mockResolvedValueOnce({ userId: "other-user" });
    expect((await POST(makeRequest())).status).toBe(404);
    mocks.selectMessage.mockResolvedValueOnce({
      ...(await mocks.selectMessage()),
      metadata: { source: "not-voice" },
    });
    expect((await POST(makeRequest())).status).toBe(404);
    expect(
      (await POST(makeRequest({ ...payload, messageId: "not-a-uuid" }))).status,
    ).toBe(400);
    mocks.selectMessage.mockResolvedValueOnce(null);
    expect((await POST(makeRequest())).status).toBe(404);
  });

  it("issues a user-bound token only after ownership and live target checks", async () => {
    const request = makeRequest({ ...payload, action: "approve" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledWith("owner-1", {
      provider: "asana",
      targetId: "project-1",
      name: "Review launch",
      details: "Review launch checklist",
    });
    expect(await response.json()).toEqual({ approvalToken: "a".repeat(48) });
  });

  it("rejects a forged destination and does not create a task", async () => {
    const response = await POST(
      makeRequest({ ...payload, targetId: "foreign-project" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.asanaExecute).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "create_task" }),
      expect.anything(),
    );
  });

  it("executes only the reviewed exact payload through the existing token-consuming connector", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(mocks.asanaExecute).toHaveBeenLastCalledWith(
      {
        action: "create_task",
        projectGid: "project-1",
        name: "Review launch",
        notes: "Review launch checklist",
        approvalToken: payload.approvalToken,
      },
      expect.objectContaining({ toolCallId: "voice-reviewed-task" }),
    );
  });

  it("fails closed when approval was replayed or the provider rejects creation", async () => {
    mocks.asanaExecute.mockImplementation(
      async (input: Record<string, unknown>) =>
        input.action === "list_projects"
          ? { projects: [{ gid: "project-1", name: "Launch" }] }
          : {
              error:
                "Asana task creation requires fresh approval for these exact fields.",
            },
    );
    expect((await POST(makeRequest())).status).toBe(502);
    mocks.asanaExecute.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await POST(makeRequest())).status).toBe(502);
  });
});
