import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserById: vi.fn(),
  selectThreadDetails: vi.fn(),
  insertThreadWithFirstMessage: vi.fn(),
  claimMessageRun: vi.fn(),
  finalizeMessageRun: vi.fn(),
  failMessageRun: vi.fn(),
  claimSnapshots: [] as any[],
  getModelAsync: vi.fn(),
  getModelInstance: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  verifyChatRequestGuard: vi.fn(),
  model: undefined as any,
  runMemoryExtraction: vi.fn(async () => {}),
  resolveGatewayFallbackCandidates: vi.fn(),
  resolveUnpricedFallbackCandidates: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
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
vi.mock("lib/ai/memory/embed", () => ({
  embedText: vi.fn(async () => ({ embedding: null })),
}));
vi.mock("lib/rag/retrieve", () => ({
  retrieveRelevantChunks: vi.fn(async () => []),
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
  resolveChatSession: vi.fn(async () => ({
    session: { user: { id: "owner-1" } },
    headless: false,
    runMode: "interactive",
    scheduledTaskId: null,
  })),
}));
vi.mock("lib/ai/routing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/ai/routing")>()),
  resolveGatewayFallbackCandidates: mocks.resolveGatewayFallbackCandidates,
  resolveUnpricedFallbackCandidates: mocks.resolveUnpricedFallbackCandidates,
}));

import { POST } from "./route";

const responseChunks = [
  { type: "stream-start" as const, warnings: [] },
  { type: "text-start" as const, id: "text-1" },
  { type: "text-delta" as const, id: "text-1", delta: "Hello from mock." },
  { type: "text-end" as const, id: "text-1" },
  {
    type: "finish" as const,
    finishReason: "stop" as const,
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
  },
];

function makeModel() {
  const model: any = {
    specificationVersion: "v2",
    provider: "controlled-test-provider",
    modelId: "controlled-test-model",
    supportedUrls: {},
    doStreamCalls: [] as unknown[],
    doStream: vi.fn(async (options: unknown) => {
      model.doStreamCalls.push(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of responseChunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
      };
    }),
  };
  return model;
}

function makeRequest(signal?: AbortSignal) {
  return new Request("https://voidagent.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "thread-stream-1",
      message: {
        id: "user-stream-1",
        role: "user",
        parts: [{ type: "text", text: "Say hello" }],
      },
      chatModel: { provider: "controlled-test-provider", model: "mock-model" },
      toolChoice: "none",
    }),
    signal,
  });
}

function makeFailingModel() {
  const model = makeModel();
  // The provider accepted the request but the stream died before any
  // content — the exact shape the mid-stream fallback retry targets.
  model.doStream = vi.fn(async (options: unknown) => {
    model.doStreamCalls.push(options);
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start", warnings: [] });
          controller.enqueue({
            type: "error",
            error: new Error("provider 500 before output"),
          });
          controller.close();
        },
      }),
    };
  });
  return model;
}

function configureChatRoute() {
  mocks.selectThreadDetails.mockResolvedValueOnce(null).mockResolvedValue({
    id: "thread-stream-1",
    userId: "owner-1",
    orgId: null,
    collectionIds: null,
    projectId: null,
    messages: [],
  });
  mocks.getModelAsync.mockResolvedValue(mocks.model);
  mocks.getModelInstance.mockResolvedValue(mocks.model);
  mocks.getModelWithFailureFallbackAsync.mockResolvedValue(mocks.model);
}

function getSerializedText(serializedStream: string) {
  return serializedStream
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => {
      try {
        const event = JSON.parse(line.slice("data: ".length));
        return event.type === "text-delta" ? [event.delta] : [];
      } catch {
        return [];
      }
    })
    .join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.model = makeModel();
  mocks.resolveGatewayFallbackCandidates.mockResolvedValue([]);
  mocks.resolveUnpricedFallbackCandidates.mockResolvedValue([]);
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.getUserById.mockResolvedValue({ id: "owner-1", tier: "pro" });
  mocks.verifyChatRequestGuard.mockResolvedValue({ ok: true });
  mocks.selectThreadDetails.mockResolvedValue(null);
  mocks.insertThreadWithFirstMessage.mockResolvedValue({
    id: "thread-stream-1",
  });
  mocks.claimMessageRun.mockResolvedValue(undefined);
  mocks.claimSnapshots.length = 0;
  mocks.claimMessageRun.mockImplementation(async (run: unknown) => {
    const claimed = structuredClone(run);
    mocks.claimSnapshots.push(claimed);
    return claimed;
  });
  mocks.finalizeMessageRun.mockResolvedValue(undefined);
  mocks.failMessageRun.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function shortenRouteDeadlineForTest(beforeDeadline?: () => void) {
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ) => {
    if (typeof delay === "number" && delay > 60_000) {
      return realSetTimeout(() => {
        beforeDeadline?.();
        if (typeof callback === "function") callback(...args);
      }, 1_500);
    }
    return realSetTimeout(callback, delay, ...args);
  }) as typeof globalThis.setTimeout);
}

describe("POST /api/chat with AI SDK serialization and a controlled model", () => {
  it("streams controlled model text and finalizes the persisted run callback", async () => {
    configureChatRoute();

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const serializedStream = await response.text();

    expect(mocks.model.doStreamCalls).toHaveLength(1);
    const textDeltas = serializedStream
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .flatMap((line) => {
        try {
          const event = JSON.parse(line.slice("data: ".length));
          return event.type === "text-delta" ? [event.delta] : [];
        } catch {
          return [];
        }
      })
      .join("");
    expect(textDeltas).toBe("Hello from mock.");
    expect(serializedStream).toContain('"type":"finish"');
    expect(mocks.claimSnapshots[0]).toEqual(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({ runStatus: "running" }),
      }),
    );
    expect(mocks.finalizeMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-stream-1",
        metadata: expect.objectContaining({ runStatus: "completed" }),
      }),
      expect.objectContaining({
        threadId: "thread-stream-1",
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({ type: "text", text: "Hello from mock." }),
        ]),
      }),
    );
    expect(mocks.failMessageRun).not.toHaveBeenCalled();
  });

  it("retries on the fallback candidate when the primary errors before any output", async () => {
    const primaryModel = makeFailingModel();
    const fallbackModel = makeModel();
    mocks.model = primaryModel;
    configureChatRoute();
    // The chain resolves regardless of which mode routing ends up in (priced
    // candidate or unpriced walk), so both resolvers are wired.
    const chain = [
      {
        chatModel: {
          provider: "controlled-test-provider",
          model: "fallback-model",
        },
      },
    ];
    mocks.resolveGatewayFallbackCandidates.mockResolvedValue(chain);
    mocks.resolveUnpricedFallbackCandidates.mockResolvedValue(chain);
    mocks.getModelInstance.mockImplementation(async (chatModel: any) =>
      chatModel?.model === "fallback-model" ? fallbackModel : primaryModel,
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    const serializedStream = await response.text();
    // The user sees the fallback's answer exactly once — no duplicated text,
    // no leaked error frame from the failed attempt.
    expect(getSerializedText(serializedStream)).toBe("Hello from mock.");
    expect(serializedStream).toContain('"type":"finish"');
    expect(serializedStream).not.toContain("provider 500");
    expect(primaryModel.doStreamCalls).toHaveLength(1);
    expect(fallbackModel.doStreamCalls).toHaveLength(1);
    expect(mocks.finalizeMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ runStatus: "completed" }),
      }),
      expect.anything(),
    );
    expect(mocks.failMessageRun).not.toHaveBeenCalled();
  });

  it("persists a retryable failed run when the controlled model stream errors", async () => {
    configureChatRoute();
    mocks.model = makeModel();
    mocks.model.modelId = "controlled-error-model";
    mocks.model.doStream = vi.fn(async (options: unknown) => {
      mocks.model.doStreamCalls.push(options);
      throw new Error("provider response contains a secret");
    });
    mocks.getModelInstance.mockResolvedValue(mocks.model);
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue(mocks.model);

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    const serializedStream = await response.text();

    expect(mocks.model.doStreamCalls.length).toBeGreaterThan(0);
    expect(serializedStream).not.toContain(
      "provider response contains a secret",
    );
    expect(mocks.failMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({
          runStatus: "failed",
          error: { code: "generation_failed", retryable: true },
        }),
      }),
    );
    expect(mocks.finalizeMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({
          runStatus: "failed",
          error: { code: "stream_error", retryable: true },
        }),
      }),
      expect.objectContaining({
        threadId: "thread-stream-1",
        role: "assistant",
        metadata: expect.objectContaining({ runStatus: "failed" }),
      }),
    );
  });

  it("persists a timed-out retryable run when the route deadline aborts generation", async () => {
    shortenRouteDeadlineForTest();
    configureChatRoute();
    let markModelStarted!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      markModelStarted = resolve;
    });
    mocks.model = makeModel();
    mocks.model.doStream = vi.fn(async (options: any) => {
      mocks.model.doStreamCalls.push(options);
      markModelStarted();
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(responseChunks[0]);
            controller.enqueue(responseChunks[1]);
            controller.enqueue({
              type: "text-delta",
              id: "text-1",
              delta: "Partial before timeout.",
            });
            const signal = options.abortSignal as AbortSignal | undefined;
            const abort = () =>
              controller.error(new DOMException("Aborted", "AbortError"));
            if (signal?.aborted) {
              abort();
            } else {
              signal?.addEventListener("abort", abort, { once: true });
            }
          },
        }),
      };
    });
    mocks.getModelInstance.mockResolvedValue(mocks.model);
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue(mocks.model);

    const responsePromise = POST(makeRequest());
    const response = await responsePromise;
    expect(response.status).toBe(200);

    const serializedPromise = response.text();
    await modelStarted;
    expect(mocks.model.doStreamCalls).toHaveLength(1);
    const serializedStream = await serializedPromise;

    expect(getSerializedText(serializedStream)).toBe("Partial before timeout.");
    expect(mocks.finalizeMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({
          runStatus: "timed_out",
          error: { code: "run_timeout", retryable: true },
        }),
      }),
      expect.objectContaining({
        threadId: "thread-stream-1",
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "Partial before timeout.",
          }),
        ]),
      }),
    );
    expect(mocks.failMessageRun).not.toHaveBeenCalled();
  }, 10_000);

  it("records an explicit client stop as cancelled even when the deadline expires too", async () => {
    const requestAbort = new AbortController();
    shortenRouteDeadlineForTest(() => requestAbort.abort());
    configureChatRoute();
    let markModelStarted!: () => void;
    const modelStarted = new Promise<void>((resolve) => {
      markModelStarted = resolve;
    });
    mocks.model = makeModel();
    mocks.model.doStream = vi.fn(async (options: any) => {
      mocks.model.doStreamCalls.push(options);
      markModelStarted();
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(responseChunks[0]);
            controller.enqueue(responseChunks[1]);
            controller.enqueue({
              type: "text-delta",
              id: "text-1",
              delta: "Partial before stop.",
            });
            const signal = options.abortSignal as AbortSignal | undefined;
            const abort = () =>
              controller.error(new DOMException("Aborted", "AbortError"));
            if (signal?.aborted) {
              abort();
            } else {
              signal?.addEventListener("abort", abort, { once: true });
            }
          },
        }),
      };
    });
    mocks.getModelInstance.mockResolvedValue(mocks.model);
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue(mocks.model);

    const response = await POST(makeRequest(requestAbort.signal));
    expect(response.status).toBe(200);
    await modelStarted;
    expect(mocks.model.doStreamCalls).toHaveLength(1);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let serializedStream = "";
    while (
      !getSerializedText(serializedStream).includes("Partial before stop.")
    ) {
      const { done, value } = await reader.read();
      if (done) break;
      serializedStream += decoder.decode(value, { stream: true });
    }
    requestAbort.abort();
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      serializedStream += decoder.decode(value, { stream: true });
    }
    serializedStream += decoder.decode();

    expect(getSerializedText(serializedStream)).toBe("Partial before stop.");
    expect(mocks.finalizeMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({
          runStatus: "cancelled",
          error: { code: "aborted", retryable: true },
        }),
      }),
      expect.objectContaining({
        threadId: "thread-stream-1",
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "Partial before stop.",
          }),
        ]),
      }),
    );
    expect(mocks.failMessageRun).not.toHaveBeenCalled();
  }, 10_000);

  it("marks the user turn non-retryable when atomic finalization keeps failing", async () => {
    configureChatRoute();
    mocks.finalizeMessageRun.mockRejectedValue(
      new Error("database transaction unavailable"),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    const serializedStream = await response.text();

    expect(serializedStream).not.toContain("database transaction unavailable");
    expect(mocks.finalizeMessageRun).toHaveBeenCalledTimes(2);
    expect(mocks.finalizeMessageRun.mock.calls[0]).toEqual(
      mocks.finalizeMessageRun.mock.calls[1],
    );
    const claimedAttemptId = mocks.claimSnapshots[0]?.metadata?.runAttemptId;
    expect(claimedAttemptId).toEqual(expect.any(String));
    expect(
      mocks.finalizeMessageRun.mock.calls[0][0].metadata.runAttemptId,
    ).toBe(claimedAttemptId);
    expect(mocks.failMessageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-stream-1",
        id: "user-stream-1",
        metadata: expect.objectContaining({
          runStatus: "failed",
          runAttemptId: claimedAttemptId,
          error: { code: "persistence_failed", retryable: false },
        }),
      }),
    );
  });
});
