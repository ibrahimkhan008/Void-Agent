import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserById: vi.fn(),
  selectThreadDetails: vi.fn(),
  insertThreadWithFirstMessage: vi.fn(),
  claimMessageRun: vi.fn(),
  finalizeMessageRun: vi.fn(),
  failMessageRun: vi.fn(),
  getModelAsync: vi.fn(),
  getModelInstance: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  resolveChatSession: vi.fn(),
  verifyChatRequestGuard: vi.fn(),
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
  streamConfiguration: undefined as any,
  runMemoryExtraction: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    createUIMessageStream: mocks.createUIMessageStream,
    createUIMessageStreamResponse: mocks.createUIMessageStreamResponse,
  };
});
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  userRepository: { getUserById: mocks.getUserById },
  memoryRepository: { getAll: vi.fn(async () => []) },
  chatRepository: {
    selectThreadDetails: mocks.selectThreadDetails,
    insertThreadWithFirstMessage: mocks.insertThreadWithFirstMessage,
    claimMessageRun: mocks.claimMessageRun,
    finalizeMessageRun: mocks.finalizeMessageRun,
    failMessageRun: mocks.failMessageRun,
  },
}));
vi.mock("lib/security/chat-request-guard.server", () => ({
  resolveChatSecuritySessionId: vi.fn(() => "session-1"),
  resolveChatSecuritySessionIpAddress: vi.fn(() => null),
  resolveChatSecuritySessionUserAgent: vi.fn(() => null),
  verifyChatRequestGuard: mocks.verifyChatRequestGuard,
}));
vi.mock("lib/rate-limit/free-tier-usage", () => ({
  getFreeTierLimitCheck: vi.fn(async () => ({ allowed: true, tokensUsed: 0 })),
  getFreeTierLimits: vi.fn(async () => ({ dailyTokens: 1_000_000 })),
  recordFreeTierTokenUsage: vi.fn(),
}));
vi.mock("app-types/subscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("app-types/subscription")>()),
  isFreeTier: vi.fn(() => false),
}));
vi.mock("lib/ai/models", () => ({
  isRateLimitError: vi.fn(() => false),
  rotateOpenRouterKey: vi.fn(() => false),
  getModelInstance: mocks.getModelInstance,
  isToolCallUnsupportedModel: vi.fn(() => false),
  supportsImageInput: vi.fn(() => false),
  customModelProvider: {
    getModelAsync: mocks.getModelAsync,
    getModelWithFailureFallbackAsync: mocks.getModelWithFailureFallbackAsync,
  },
  ensureDynamicProvidersHydrated: vi.fn(async () => {}),
  supportsNativeImageInput: vi.fn(() => false),
  supportsToolCallingForChatModel: vi.fn(async () => false),
}));
vi.mock("lib/ai/memory/extract-and-store", () => ({
  runMemoryExtraction: mocks.runMemoryExtraction,
}));
vi.mock("lib/ai/model-provider-availability", () => ({
  isChatModelProviderEnabled: vi.fn(async () => true),
  isChatProviderEnabled: vi.fn(() => true),
}));
vi.mock("./actions", () => ({
  rememberAgentAction: vi.fn(async () => null),
  rememberMcpServerCustomizationsAction: vi.fn(async () => null),
}));
vi.mock("lib/ai/skills", () => ({
  buildSkillSystemPrompt: vi.fn(() => ""),
  resolveSlashSkillInvocation: vi.fn(async () => null),
}));
vi.mock("@/lib/gate", () => ({
  CreditsExhaustedError: class CreditsExhaustedError extends Error {},
  assertCreditsAvailable: vi.fn(async () => {}),
  requireBillingContext: vi.fn(async () => ({
    customerId: "owner-1",
    userId: "owner-1",
    entityId: undefined,
  })),
  requireFeature: vi.fn(async () => {}),
  trackUsage: vi.fn(async () => {}),
}));
vi.mock("./route-helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./route-helpers")>()),
  resolveChatSession: mocks.resolveChatSession,
}));

import { POST } from "./route";

const validRequestBody = {
  id: "thread-1",
  message: {
    id: "message-1",
    role: "assistant",
    parts: [{ type: "text", text: "forged role" }],
  },
  toolChoice: "none",
};

function makeRequest(body: unknown = validRequestBody) {
  return new Request("https://voidagent.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.resolveChatSession.mockResolvedValue({
    session: { user: { id: "owner-1" } },
    headless: false,
    runMode: "interactive",
    scheduledTaskId: null,
  });
  mocks.getUserById.mockResolvedValue({ id: "owner-1", tier: "pro" });
  mocks.verifyChatRequestGuard.mockResolvedValue({ ok: true });
  mocks.selectThreadDetails.mockResolvedValue(null);
  mocks.insertThreadWithFirstMessage.mockResolvedValue({ id: "thread-1" });
  mocks.getModelAsync.mockRejectedValue(
    new Error("test stops before provider"),
  );
  mocks.getModelInstance.mockRejectedValue(
    new Error("test stops before provider"),
  );
  mocks.getModelWithFailureFallbackAsync.mockResolvedValue({
    id: "runtime-model",
  });
  mocks.claimMessageRun.mockImplementation(async (run) => run);
  mocks.finalizeMessageRun.mockResolvedValue(undefined);
  mocks.failMessageRun.mockResolvedValue(true);
  mocks.createUIMessageStream.mockImplementation((configuration) => {
    mocks.streamConfiguration = configuration;
    return { lifecycleStream: true };
  });
  mocks.createUIMessageStreamResponse.mockImplementation(
    () => new Response("stream response"),
  );
});

describe("POST /api/chat lifecycle guards", () => {
  it("rejects unauthenticated chat before loading a user or touching persistence", async () => {
    mocks.resolveChatSession.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }) as any,
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.insertThreadWithFirstMessage).not.toHaveBeenCalled();
    expect(mocks.claimMessageRun).not.toHaveBeenCalled();
  });

  it("rejects a failed security challenge before reading or writing chat state", async () => {
    mocks.verifyChatRequestGuard.mockResolvedValue({
      ok: false,
      status: 403,
      code: "challenge-expired",
      message: "Challenge expired. Please retry.",
    });

    const response = await POST(
      makeRequest({
        ...validRequestBody,
        message: {
          ...validRequestBody.message,
          role: "user",
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "challenge-expired",
    });
    expect(mocks.verifyChatRequestGuard).toHaveBeenCalledOnce();
    expect(mocks.selectThreadDetails).not.toHaveBeenCalled();
    expect(mocks.insertThreadWithFirstMessage).not.toHaveBeenCalled();
    expect(mocks.claimMessageRun).not.toHaveBeenCalled();
    expect(mocks.getModelInstance).not.toHaveBeenCalled();
  });

  it("rejects a non-user message role before creating a thread or claiming a run", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "invalid_message",
    });
    // The route may resolve the thread before validating the submitted role,
    // but it must reject before creating or claiming any persisted message.
    expect(mocks.selectThreadDetails).toHaveBeenCalledWith("thread-1");
    expect(mocks.insertThreadWithFirstMessage).not.toHaveBeenCalled();
    expect(mocks.claimMessageRun).not.toHaveBeenCalled();
  });

  it("rejects a foreign-owned conversation before claiming or creating messages", async () => {
    mocks.selectThreadDetails.mockResolvedValue({
      id: "thread-1",
      userId: "another-user",
      orgId: null,
      collectionIds: null,
      projectId: null,
      messages: [],
    });
    const requestBody = {
      ...validRequestBody,
      message: {
        ...validRequestBody.message,
        role: "user",
      },
    };

    const response = await POST(makeRequest(requestBody));

    expect(response.status).toBe(403);
    expect(mocks.selectThreadDetails).toHaveBeenCalledWith("thread-1");
    expect(mocks.insertThreadWithFirstMessage).not.toHaveBeenCalled();
    expect(mocks.claimMessageRun).not.toHaveBeenCalled();
  });

  it("maps a duplicate message-run claim to a stable conflict without invoking the provider", async () => {
    const requestBody = {
      ...validRequestBody,
      message: {
        ...validRequestBody.message,
        role: "user",
        parts: [{ type: "text", text: "duplicate turn" }],
      },
    };
    mocks.selectThreadDetails.mockResolvedValue({
      id: "thread-1",
      userId: "owner-1",
      orgId: null,
      collectionIds: null,
      projectId: null,
      messages: [],
    });
    mocks.claimMessageRun.mockRejectedValue(
      Object.assign(new Error("duplicate run"), {
        name: "ChatMessageRunConflictError",
      }),
    );

    const response = await POST(makeRequest(requestBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "duplicate_message",
      retryable: false,
    });
    expect(mocks.claimMessageRun).toHaveBeenCalledOnce();
    expect(mocks.getModelInstance).not.toHaveBeenCalled();
    expect(mocks.finalizeMessageRun).not.toHaveBeenCalled();
  });

  it("creates a new thread with its first user message in the atomic repository operation", async () => {
    mocks.selectThreadDetails.mockResolvedValueOnce(null).mockResolvedValue({
      id: "thread-1",
      userId: "owner-1",
      orgId: null,
      collectionIds: null,
      projectId: null,
      messages: [],
    });
    const requestBody = {
      ...validRequestBody,
      message: {
        ...validRequestBody.message,
        role: "user",
        parts: [{ type: "text", text: "first turn" }],
      },
      chatModel: { provider: "test-provider", model: "test-model" },
    };

    const response = await POST(makeRequest(requestBody));

    // The mocked model resolution intentionally fails after thread creation;
    // this test is limited to verifying the atomic create-with-first-message
    // route wiring, not the provider or full streaming lifecycle.
    expect(response.status).toBe(500);
    expect(mocks.insertThreadWithFirstMessage).toHaveBeenCalledTimes(1);
    expect(mocks.insertThreadWithFirstMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "thread-1",
        userId: "owner-1",
      }),
      expect.objectContaining({
        id: "message-1",
        threadId: "thread-1",
        role: "user",
        parts: [{ type: "text", text: "first turn" }],
      }),
    );
    expect(mocks.claimMessageRun).toHaveBeenCalledOnce();
    expect(mocks.getModelInstance).toHaveBeenCalledWith(
      {
        provider: "test-provider",
        model: "test-model",
      },
      "owner-1",
    );
  });
});
