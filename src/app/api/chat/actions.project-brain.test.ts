import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  chatRepository: {
    checkAccess: vi.fn(),
    selectThread: vi.fn(),
    selectMessage: vi.fn(),
    updateThread: vi.fn(),
    deleteChatMessage: vi.fn(),
    deleteThread: vi.fn(),
    deleteMessagesByChatIdAfterTimestamp: vi.fn(),
    upsertMessage: vi.fn(),
  },
  getProjectAccess: vi.fn(),
  canEditProjectRole: vi.fn(),
  isProjectCollectionScopeAllowed: vi.fn(),
  refreshProjectBrainChatSource: vi.fn(),
  revokeProjectBrainChatSource: vi.fn(),
  convertToSavePart: vi.fn((part: unknown) => part),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  agentRepository: {},
  chatExportRepository: {},
  chatRepository: mocks.chatRepository,
  mcpMcpToolCustomizationRepository: {},
  mcpServerCustomizationRepository: {},
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
}));
vi.mock("lib/projects/policy", () => ({
  canEditProjectRole: mocks.canEditProjectRole,
  isProjectCollectionScopeAllowed: mocks.isProjectCollectionScopeAllowed,
}));
vi.mock("lib/projects/project-chat-brain-source", () => ({
  refreshProjectBrainChatSource: mocks.refreshProjectBrainChatSource,
  revokeProjectBrainChatSource: mocks.revokeProjectBrainChatSource,
}));
vi.mock("./shared.chat", () => ({
  convertToSavePart: mocks.convertToSavePart,
}));
vi.mock("lib/ai/models", () => ({ customModelProvider: {} }));
vi.mock("lib/ai/prompts", () => ({
  CREATE_THREAD_TITLE_PROMPT: "",
  generateExampleToolSchemaPrompt: vi.fn(),
}));
vi.mock("lib/cache", () => ({ serverCache: {} }));
vi.mock("lib/cache/cache-keys", () => ({ CacheKeys: {} }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: vi.fn(),
}));
vi.mock("lib/utils", () => ({ toAny: vi.fn() }));
vi.mock("logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock("lib/ai/tools/sanitize-tool-schemas", () => ({
  normalizeToolInputSchema: vi.fn(),
}));
vi.mock("lib/collections/access", () => ({ getCollectionAccess: vi.fn() }));
vi.mock("lib/json-schema-to-zod", () => ({ jsonSchemaToZod: vi.fn() }));
vi.mock("lib/voice/handoff", () => ({ getVoiceTranscriptForHandoff: vi.fn() }));
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: vi.fn(),
}));

import {
  deleteMessageAction,
  deleteMessagesByChatIdAfterTimestampAction,
  deleteThreadAction,
  updateThreadAction,
  updateThreadCollectionScopeAction,
  updateThreadProjectAction,
  upsertThreadMessageAction,
} from "./actions";

const thread = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003",
};

describe("project chat brain lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: thread.userId } });
    mocks.getProjectAccess.mockResolvedValue({ role: "editor", project: {} });
    mocks.canEditProjectRole.mockReturnValue(true);
    mocks.chatRepository.selectThread.mockResolvedValue(thread);
    mocks.chatRepository.checkAccess.mockResolvedValue(true);
    mocks.chatRepository.selectMessage.mockResolvedValue({
      id: "message-1",
      threadId: thread.id,
    });
    mocks.chatRepository.updateThread.mockResolvedValue(undefined);
    mocks.chatRepository.deleteChatMessage.mockResolvedValue(true);
    mocks.chatRepository.deleteMessagesByChatIdAfterTimestamp.mockResolvedValue(
      true,
    );
    mocks.chatRepository.deleteThread.mockResolvedValue(undefined);
    mocks.chatRepository.upsertMessage.mockResolvedValue(undefined);
    mocks.refreshProjectBrainChatSource.mockResolvedValue({ queued: true });
    mocks.revokeProjectBrainChatSource.mockResolvedValue(true);
  });

  it("refreshes the owner-bound snapshot after a message edit", async () => {
    await upsertThreadMessageAction({
      threadId: thread.id,
      message: {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "edited" }],
      },
    });
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: thread.id,
      userId: thread.userId,
      forceEnqueue: true,
    });
  });

  it("refreshes immediately after message deletion and thread truncation", async () => {
    await deleteMessageAction("message-1");
    await deleteMessagesByChatIdAfterTimestampAction("message-1");
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledTimes(2);
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenNthCalledWith(1, {
      threadId: thread.id,
      userId: thread.userId,
      forceEnqueue: true,
    });
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenNthCalledWith(2, {
      threadId: thread.id,
      userId: thread.userId,
      forceEnqueue: true,
    });
  });

  it("revokes the source before deleting a project thread", async () => {
    await deleteThreadAction(thread.id);
    expect(mocks.revokeProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: thread.id,
      projectId: thread.projectId,
      userId: thread.userId,
    });
    expect(mocks.chatRepository.deleteThread).toHaveBeenCalledWith(thread.id);
  });

  it("revokes the old project source when a thread is detached", async () => {
    const nextProjectId = "00000000-0000-4000-8000-000000000004";
    await updateThreadProjectAction(thread.id, nextProjectId);
    expect(mocks.revokeProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: thread.id,
      projectId: thread.projectId,
      userId: thread.userId,
    });
    expect(mocks.chatRepository.updateThread).toHaveBeenCalledWith(thread.id, {
      userId: thread.userId,
      projectId: nextProjectId,
      collectionIds: null,
    });
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: thread.id,
      userId: thread.userId,
      forceEnqueue: true,
    });
  });

  it("enqueues existing messages when attaching a conversation to a project", async () => {
    const nextProjectId = "00000000-0000-4000-8000-000000000004";
    mocks.chatRepository.selectThread.mockResolvedValueOnce({
      ...thread,
      projectId: null,
    });

    await updateThreadProjectAction(thread.id, nextProjectId);

    expect(mocks.revokeProjectBrainChatSource).not.toHaveBeenCalled();
    expect(mocks.chatRepository.updateThread).toHaveBeenCalledWith(thread.id, {
      userId: thread.userId,
      projectId: nextProjectId,
      collectionIds: null,
    });
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: thread.id,
      userId: thread.userId,
      forceEnqueue: true,
    });
  });

  it("rejects project and collection scope mutations through the generic thread updater", async () => {
    await expect(
      updateThreadAction(thread.id, { projectId: "another-project" } as never),
    ).rejects.toThrow("dedicated actions");
    await expect(
      updateThreadAction(thread.id, {
        collectionIds: ["collection-1"],
      } as never),
    ).rejects.toThrow("dedicated actions");
    expect(mocks.chatRepository.updateThread).not.toHaveBeenCalled();
  });

  it("only persists a collection scope that is attached to the current project", async () => {
    const attachedCollectionId = "00000000-0000-4000-8000-000000000005";
    const detachedCollectionId = "00000000-0000-4000-8000-000000000006";
    mocks.getProjectAccess.mockResolvedValueOnce({
      role: "editor",
      project: { collectionIds: [attachedCollectionId] },
    });
    mocks.isProjectCollectionScopeAllowed.mockReturnValueOnce(false);

    await expect(
      updateThreadCollectionScopeAction(thread.id, [detachedCollectionId]),
    ).rejects.toThrow("Collections must be attached to this project");
    expect(mocks.chatRepository.updateThread).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValueOnce({
      role: "editor",
      project: { collectionIds: [attachedCollectionId] },
    });
    mocks.isProjectCollectionScopeAllowed.mockReturnValueOnce(true);
    await updateThreadCollectionScopeAction(thread.id, [attachedCollectionId]);
    expect(mocks.chatRepository.updateThread).toHaveBeenCalledWith(thread.id, {
      userId: thread.userId,
      collectionIds: [attachedCollectionId],
    });
  });
});
