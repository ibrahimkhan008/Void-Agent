import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserById: vi.fn(),
  checkApiRateLimit: vi.fn(),
  getFreeTierLimitCheck: vi.fn(),
  checkAccess: vi.fn(),
  selectThreadDetails: vi.fn(),
  upsertThread: vi.fn(),
  getProjectAccess: vi.fn(),
  reserveTeamBudgetForAiRequest: vi.fn(),
  settleTeamBudgetForAiRequest: vi.fn(),
  getModelAsync: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  streamText: vi.fn(),
  handleError: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("ai", () => ({
  smoothStream: vi.fn(() => "smooth-transform"),
  streamText: mocks.streamText,
}));
vi.mock("app-types/subscription", () => ({ isFreeTier: vi.fn(() => false) }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("consola/utils", () => ({ colorize: vi.fn((_, value) => value) }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelAsync: mocks.getModelAsync,
    getModelWithFailureFallbackAsync: mocks.getModelWithFailureFallbackAsync,
  },
}));
vi.mock("lib/ai/prompts", () => ({
  CREATE_THREAD_TITLE_PROMPT: "title prompt",
}));
vi.mock("lib/ai/team-member-ai-budget", () => ({
  TeamBudgetAuthorizationError: class TeamBudgetAuthorizationError extends Error {},
  TeamBudgetExceededError: class TeamBudgetExceededError extends Error {},
  TeamBudgetPolicyError: class TeamBudgetPolicyError extends Error {},
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  reserveTeamBudgetForAiRequest: mocks.reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest: mocks.settleTeamBudgetForAiRequest,
}));
vi.mock("lib/ai/team-member-ai-budget-gate", () => ({
  TeamBudgetCurrencyMismatchError: class TeamBudgetCurrencyMismatchError extends Error {},
  TeamBudgetModelUnpricedError: class TeamBudgetModelUnpricedError extends Error {},
}));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    checkAccess: mocks.checkAccess,
    selectThreadDetails: mocks.selectThreadDetails,
    upsertThread: mocks.upsertThread,
  },
  userRepository: { getUserById: mocks.getUserById },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/rate-limit/free-tier-usage", () => ({
  getFreeTierLimitCheck: mocks.getFreeTierLimitCheck,
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: vi.fn(() => ({ info: vi.fn(), error: mocks.loggerError })),
  },
}));
vi.mock("../shared.chat", () => ({ handleError: mocks.handleError }));

import { POST } from "./route";

const lease = {
  reservationId: "lease-1",
  estimateMicros: 100,
  price: {
    inputMicrosPerMillion: 1,
    outputMicrosPerMillion: 1,
    currency: "EUR",
  },
};
const request = (body: unknown) =>
  new Request("https://void.test/api/chat/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const rawRequest = (body: string) =>
  new Request("https://void.test/api/chat/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("POST /api/chat/title team budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getUserById.mockResolvedValue({ tier: "pro" });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.getFreeTierLimitCheck.mockResolvedValue({ allowed: true });
    mocks.checkAccess.mockResolvedValue(true);
    mocks.selectThreadDetails.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      orgId: "team-1",
      projectId: null,
    });
    mocks.getProjectAccess.mockResolvedValue(null);
    mocks.reserveTeamBudgetForAiRequest.mockResolvedValue(lease);
    mocks.settleTeamBudgetForAiRequest.mockResolvedValue(undefined);
    mocks.getModelAsync.mockResolvedValue({ id: "direct-model" });
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue({
      id: "fallback-model",
    });
    mocks.upsertThread.mockResolvedValue(undefined);
    mocks.handleError.mockReturnValue("request failed");
    mocks.streamText.mockImplementation(() => ({
      toUIMessageStreamResponse: vi.fn(() =>
        Response.json({ stream: true }, { status: 200 }),
      ),
    }));
  });

  it("derives billing scope from the owned persisted thread and settles actual usage", async () => {
    const response = await POST(
      request({
        threadId: "thread-1",
        message: "Name this conversation",
        chatModel: { provider: "google", model: "Gemini 3 Flash" },
        teamId: "attacker-controlled-team",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveTeamBudgetForAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team-1", userId: "user-1" }),
    );
    expect(mocks.getModelAsync).toHaveBeenCalledOnce();
    expect(mocks.getModelWithFailureFallbackAsync).not.toHaveBeenCalled();
    const callbacks = mocks.streamText.mock.calls[0][0];
    await callbacks.onFinish({
      text: "Conversation title",
      totalUsage: { inputTokens: 20, outputTokens: 5 },
    });
    expect(mocks.settleTeamBudgetForAiRequest).toHaveBeenCalledWith(lease, {
      usage: { inputTokens: 20, outputTokens: 5 },
    });
    expect(mocks.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "thread-1",
        title: "Conversation title",
        userId: "user-1",
      }),
    );
  });

  it("never trusts a request team ID or bills a fresh personal thread", async () => {
    mocks.checkAccess.mockResolvedValue(false);
    mocks.selectThreadDetails.mockResolvedValue(null);
    mocks.reserveTeamBudgetForAiRequest.mockResolvedValueOnce(undefined);
    await POST(
      request({
        threadId: "fresh-thread",
        teamId: "attacker-controlled-team",
        chatModel: { provider: "google", model: "Gemini 3 Flash" },
      }),
    );

    expect(mocks.reserveTeamBudgetForAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: undefined, userId: "user-1" }),
    );
    expect(mocks.getModelWithFailureFallbackAsync).toHaveBeenCalledOnce();
  });

  it("does not generate a title for another user's thread", async () => {
    mocks.checkAccess.mockResolvedValue(false);
    mocks.selectThreadDetails.mockResolvedValue({
      id: "private-thread",
      userId: "another-user",
      orgId: "team-1",
    });
    const response = await POST(request({ threadId: "private-thread" }));

    expect(response.status).toBe(404);
    expect(mocks.reserveTeamBudgetForAiRequest).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("uses current authorized project team scope for a persisted thread", async () => {
    mocks.selectThreadDetails.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      orgId: "old-team",
      projectId: "project-1",
    });
    mocks.getProjectAccess.mockResolvedValue({
      project: { teamId: "current-team" },
    });
    await POST(request({ threadId: "thread-1" }));

    expect(mocks.getProjectAccess).toHaveBeenCalledWith("project-1", "user-1");
    expect(mocks.reserveTeamBudgetForAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "current-team" }),
    );
  });

  it("rejects malformed, oversized, and invalid requests before budgeting or generation", async () => {
    const malformed = await POST(rawRequest("{"));
    const oversized = await POST(
      rawRequest(JSON.stringify({ message: "x".repeat(16_385) })),
    );
    const invalid = await POST(request({ message: "x".repeat(8_001) }));
    const invalidModel = await POST(
      request({ chatModel: { provider: "", model: "x" } }),
    );

    expect([
      malformed.status,
      oversized.status,
      invalid.status,
      invalidModel.status,
    ]).toEqual([400, 413, 400, 400]);
    expect(mocks.reserveTeamBudgetForAiRequest).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("releases a reservation when generation aborts or errors", async () => {
    await POST(request({ threadId: "thread-1" }));
    const callbacks = mocks.streamText.mock.calls[0][0];
    await callbacks.onAbort();
    await callbacks.onError({ error: new Error("provider failure") });

    expect(mocks.settleTeamBudgetForAiRequest).toHaveBeenCalledTimes(1);
    expect(mocks.settleTeamBudgetForAiRequest).toHaveBeenCalledWith(lease, {
      aborted: true,
    });
  });

  it("returns the hard-stop response without calling the provider", async () => {
    const { TeamBudgetExceededError } = await import(
      "lib/ai/team-member-ai-budget"
    );
    mocks.reserveTeamBudgetForAiRequest.mockRejectedValue(
      new TeamBudgetExceededError(),
    );
    const response = await POST(request({ threadId: "thread-1" }));

    expect(response.status).toBe(402);
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.getModelAsync).not.toHaveBeenCalled();
  });

  it("fails closed for a capped member when the selected model is unpriced", async () => {
    const { TeamBudgetModelUnpricedError } = await import(
      "lib/ai/team-member-ai-budget-gate"
    );
    mocks.reserveTeamBudgetForAiRequest.mockRejectedValue(
      new TeamBudgetModelUnpricedError(),
    );
    const response = await POST(request({ threadId: "thread-1" }));

    expect(response.status).toBe(503);
    expect(mocks.getModelAsync).not.toHaveBeenCalled();
    expect(mocks.getModelWithFailureFallbackAsync).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});
