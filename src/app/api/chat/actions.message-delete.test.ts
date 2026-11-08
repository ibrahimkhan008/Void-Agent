import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectMessage: vi.fn(),
  selectThread: vi.fn(),
  deleteChatMessage: vi.fn(),
  deleteMessagesByChatIdAfterTimestamp: vi.fn(),
  refreshProjectBrainChatSource: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  agentRepository: {},
  chatExportRepository: {},
  chatRepository: {
    selectMessage: mocks.selectMessage,
    selectThread: mocks.selectThread,
    deleteChatMessage: mocks.deleteChatMessage,
    deleteMessagesByChatIdAfterTimestamp:
      mocks.deleteMessagesByChatIdAfterTimestamp,
  },
  mcpMcpToolCustomizationRepository: {},
  mcpServerCustomizationRepository: {},
}));
vi.mock("lib/projects/project-chat-brain-source", () => ({
  refreshProjectBrainChatSource: mocks.refreshProjectBrainChatSource,
  revokeProjectBrainChatSource: vi.fn(),
}));
vi.mock("lib/projects/access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("lib/projects/policy", () => ({
  canEditProjectRole: vi.fn(),
  isProjectCollectionScopeAllowed: vi.fn(),
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
vi.mock("./shared.chat", () => ({ convertToSavePart: vi.fn((part) => part) }));
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: vi.fn(),
}));

import {
  deleteMessageAction,
  deleteMessagesByChatIdAfterTimestampAction,
} from "./actions";

const ownerId = "00000000-0000-4000-8000-000000000001";
const message = { id: "message-1", threadId: "thread-1" };
const projectThread = {
  id: "thread-1",
  userId: ownerId,
  projectId: "project-1",
};

describe("chat message delete ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: ownerId } });
    mocks.selectMessage.mockResolvedValue(message);
    mocks.selectThread.mockResolvedValue(projectThread);
    mocks.deleteChatMessage.mockResolvedValue(true);
    mocks.deleteMessagesByChatIdAfterTimestamp.mockResolvedValue(true);
    mocks.refreshProjectBrainChatSource.mockResolvedValue({ queued: true });
  });

  it("passes the session owner to the atomic single-message delete", async () => {
    await deleteMessageAction(message.id);

    expect(mocks.deleteChatMessage).toHaveBeenCalledWith(message.id, ownerId);
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: projectThread.id,
      userId: ownerId,
      forceEnqueue: true,
    });
  });

  it("passes the session owner to the atomic turn truncation", async () => {
    await deleteMessagesByChatIdAfterTimestampAction(message.id);

    expect(mocks.deleteMessagesByChatIdAfterTimestamp).toHaveBeenCalledWith(
      message.id,
      ownerId,
    );
    expect(mocks.refreshProjectBrainChatSource).toHaveBeenCalledWith({
      threadId: projectThread.id,
      userId: ownerId,
      forceEnqueue: true,
    });
  });

  it("rejects a foreign thread before calling either delete operation", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000002" },
    });

    await expect(deleteMessageAction(message.id)).rejects.toThrow(
      "Unauthorized",
    );
    await expect(
      deleteMessagesByChatIdAfterTimestampAction(message.id),
    ).rejects.toThrow("Unauthorized");

    expect(mocks.deleteChatMessage).not.toHaveBeenCalled();
    expect(mocks.deleteMessagesByChatIdAfterTimestamp).not.toHaveBeenCalled();
    expect(mocks.refreshProjectBrainChatSource).not.toHaveBeenCalled();
  });

  it("does not refresh project snapshots when the atomic delete is a no-op", async () => {
    mocks.deleteChatMessage.mockResolvedValue(false);
    mocks.deleteMessagesByChatIdAfterTimestamp.mockResolvedValue(false);

    await deleteMessageAction(message.id);
    await deleteMessagesByChatIdAfterTimestampAction(message.id);

    expect(mocks.refreshProjectBrainChatSource).not.toHaveBeenCalled();
  });
});
