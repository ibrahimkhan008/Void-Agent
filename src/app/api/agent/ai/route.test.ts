import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  loadAppDefaultTools: vi.fn(),
  composioConfigured: vi.fn(),
  listComposioToolkits: vi.fn(),
  listComposioAccounts: vi.fn(),
  buildAgentGenerationPrompt: vi.fn(),
  mcpTools: vi.fn(),
  selectExecuteAbility: vi.fn(),
  getTeamMember: vi.fn(),
  reserveTeamBudget: vi.fn(),
  settleTeamBudget: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  getModelAsync: vi.fn(),
  streamObject: vi.fn(),
  loggerError: vi.fn(),
  TeamBudgetExceededError: class TeamBudgetExceededError extends Error {},
  TeamBudgetAuthorizationError: class TeamBudgetAuthorizationError extends Error {},
  TeamBudgetPolicyError: class TeamBudgetPolicyError extends Error {},
  TeamBudgetModelUnpricedError: class TeamBudgetModelUnpricedError extends Error {},
  TeamBudgetCurrencyMismatchError: class TeamBudgetCurrencyMismatchError extends Error {},
}));

vi.mock("ai", () => ({ streamObject: mocks.streamObject }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("consola/utils", () => ({ colorize: vi.fn((_, value) => value) }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: mocks.getModelWithFailureFallbackAsync,
    getModelAsync: mocks.getModelAsync,
  },
}));
vi.mock("lib/ai/team-member-ai-budget", () => ({
  TeamBudgetAuthorizationError: mocks.TeamBudgetAuthorizationError,
  TeamBudgetExceededError: mocks.TeamBudgetExceededError,
  TeamBudgetPolicyError: mocks.TeamBudgetPolicyError,
}));
vi.mock("lib/ai/team-member-ai-budget-gate", () => ({
  TeamBudgetCurrencyMismatchError: mocks.TeamBudgetCurrencyMismatchError,
  TeamBudgetModelUnpricedError: mocks.TeamBudgetModelUnpricedError,
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  reserveTeamBudgetForAiRequest: mocks.reserveTeamBudget,
  settleTeamBudgetForAiRequest: mocks.settleTeamBudget,
}));
vi.mock("lib/ai/prompts", () => ({
  buildAgentGenerationPrompt: mocks.buildAgentGenerationPrompt,
}));
vi.mock("lib/ai/composio", () => ({
  isComposioConfigured: mocks.composioConfigured,
  listComposioToolkits: mocks.listComposioToolkits,
  listComposioAccountsForUser: mocks.listComposioAccounts,
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: mocks.mcpTools },
}));
vi.mock("lib/db/repository", () => ({
  teamRepository: { getTeamMember: mocks.getTeamMember },
  workflowRepository: { selectExecuteAbility: mocks.selectExecuteAbility },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("../../chat/shared.chat", () => ({
  loadAppDefaultTools: mocks.loadAppDefaultTools,
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: mocks.loggerError,
    })),
  },
}));

import { POST } from "./route";

const makeRequest = (body: string) =>
  new Request("https://void.test/api/agent/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("POST /api/agent/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" }, session: {} });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.loadAppDefaultTools.mockResolvedValue({});
    mocks.composioConfigured.mockReturnValue(false);
    mocks.listComposioToolkits.mockResolvedValue({ items: [] });
    mocks.listComposioAccounts.mockResolvedValue([]);
    mocks.buildAgentGenerationPrompt.mockImplementation(
      (names: string[], apps: Array<{ slug: string; name: string }> = []) =>
        `tools:${names.join(",")}\napps:${JSON.stringify(apps)}`,
    );
    mocks.mcpTools.mockResolvedValue({});
    mocks.selectExecuteAbility.mockResolvedValue([]);
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue({ id: "model" });
    mocks.getModelAsync.mockResolvedValue({ id: "pinned-model" });
    mocks.reserveTeamBudget.mockResolvedValue(undefined);
    mocks.settleTeamBudget.mockResolvedValue(undefined);
    mocks.streamObject.mockReturnValue({
      toTextStreamResponse: () => Response.json({ stream: true }),
    });
  });

  it("requires a session before reading or generating from the request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(
      makeRequest(JSON.stringify({ message: "hello" })),
    );

    expect(response.status).toBe(401);
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("rate limits agent generation per authenticated user", async () => {
    mocks.checkApiRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 2_000,
    });
    const response = await POST(
      makeRequest(JSON.stringify({ message: "hello" })),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized, and out-of-contract input before model work", async () => {
    const malformed = await POST(makeRequest("{"));
    const oversized = await POST(
      makeRequest(JSON.stringify({ message: "x".repeat(16_385) })),
    );
    const longPrompt = await POST(
      makeRequest(JSON.stringify({ message: "x".repeat(8_001) })),
    );
    const invalidModel = await POST(
      makeRequest(JSON.stringify({ chatModel: { provider: "", model: "x" } })),
    );
    const extraField = await POST(
      makeRequest(JSON.stringify({ message: "hello", teamId: "untrusted" })),
    );

    expect([
      malformed.status,
      oversized.status,
      longPrompt.status,
      invalidModel.status,
      extraField.status,
    ]).toEqual([400, 413, 400, 400, 400]);
    expect(mocks.streamObject).not.toHaveBeenCalled();
    expect(mocks.loadAppDefaultTools).not.toHaveBeenCalled();
  });

  it("uses the authenticated user's allowed tool inventory for generation", async () => {
    mocks.loadAppDefaultTools.mockResolvedValue({ search: {} });
    mocks.mcpTools.mockResolvedValue({ mcp: { _originToolName: "calendar" } });
    mocks.selectExecuteAbility.mockResolvedValue([{ name: "Workflow" }]);
    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create a research agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.checkApiRateLimit).toHaveBeenCalledWith({
      kind: "agent-generate-user",
      id: "user-1",
      limit: 10,
      windowMs: 60_000,
    });
    expect(mocks.selectExecuteAbility).toHaveBeenCalledWith("user-1");
    expect(mocks.getModelWithFailureFallbackAsync).toHaveBeenCalledWith({
      provider: "google",
      model: "Gemini 3 Flash",
    });
    expect(mocks.streamObject).toHaveBeenCalledOnce();
  });

  it("suggests only safe unconnected apps without granting their tools", async () => {
    mocks.loadAppDefaultTools.mockResolvedValue({ search: {} });
    mocks.composioConfigured.mockReturnValue(true);
    mocks.listComposioToolkits.mockResolvedValue({
      items: [
        { slug: "salesforce", name: "Salesforce" },
        { slug: "hubspot", name: "HubSpot" },
        { slug: "noauth", name: "No auth", isNoAuth: true },
        { slug: "bad slug", name: "Invalid slug" },
      ],
    });
    mocks.listComposioAccounts.mockResolvedValue([
      { toolkit: { slug: "hubspot" } },
    ]);

    const response = await POST(
      makeRequest(JSON.stringify({ message: "Create a CRM agent" })),
    );
    expect(response.status).toBe(200);
    expect(mocks.listComposioToolkits).toHaveBeenCalledWith("user-1", {
      limit: 50,
    });
    expect(mocks.listComposioAccounts).toHaveBeenCalledWith("user-1", {
      includeShared: true,
    });
    expect(mocks.buildAgentGenerationPrompt).toHaveBeenCalledWith(
      ["search"],
      [{ slug: "salesforce", name: "Salesforce" }],
    );

    const generation = mocks.streamObject.mock.calls[0]?.[0];
    expect(generation.system).toContain("Salesforce");
    expect(
      generation.schema.safeParse({
        name: "CRM agent",
        description: "Manage CRM records",
        instructions: "Use connected tools only",
        role: "CRM assistant",
        tools: ["SALESFORCE_CREATE_RECORD"],
      }).success,
    ).toBe(false);
  });

  it("rejects generation when the active team monthly budget is exceeded", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.getTeamMember.mockResolvedValue({
      teamId: "team-1",
      userId: "user-1",
    });
    mocks.reserveTeamBudget.mockRejectedValue(
      new mocks.TeamBudgetExceededError("monthly allowance exhausted"),
    );

    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      code: "team-member-budget-exceeded",
      message: "monthly allowance exhausted",
    });
    expect(mocks.reserveTeamBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        userId: "user-1",
        model: { provider: "google", model: "Gemini 3 Flash" },
        idempotencyScope: "agent-generation",
      }),
    );
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("fails closed when an active non-owner team member has no allowance policy", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.getTeamMember.mockResolvedValue({
      teamId: "team-1",
      userId: "user-1",
      role: "member",
    });
    mocks.reserveTeamBudget.mockRejectedValue(
      new mocks.TeamBudgetPolicyError("missing member allowance"),
    );

    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "team-budget-unavailable",
      message: "The team AI budget could not be verified for this model.",
    });
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("rejects a stale active team before looking up tools or generating", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "revoked-team" },
    });
    mocks.getTeamMember.mockResolvedValue(null);

    const response = await POST(
      makeRequest(JSON.stringify({ message: "Create an agent" })),
    );

    expect(response.status).toBe(403);
    expect(mocks.getTeamMember).toHaveBeenCalledWith("revoked-team", "user-1");
    expect(mocks.loadAppDefaultTools).not.toHaveBeenCalled();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("settles the reservation with provider usage after successful generation", async () => {
    const lease = { reservationId: "lease-1", estimateMicros: 99, price: {} };
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.getTeamMember.mockResolvedValue({
      teamId: "team-1",
      userId: "user-1",
    });
    mocks.reserveTeamBudget.mockResolvedValue(lease);

    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getModelAsync).toHaveBeenCalledWith({
      provider: "google",
      model: "Gemini 3 Flash",
    });
    expect(mocks.getModelWithFailureFallbackAsync).not.toHaveBeenCalled();
    const options = mocks.streamObject.mock.calls[0]?.[0];
    expect(options.model).toEqual({ id: "pinned-model" });
    await options.onFinish({
      usage: { inputTokens: 23, outputTokens: 12 },
    });
    expect(mocks.settleTeamBudget).toHaveBeenCalledWith(lease, {
      usage: { inputTokens: 23, outputTokens: 12 },
    });
  });

  it("releases the reservation after a provider failure", async () => {
    const lease = { reservationId: "lease-2", estimateMicros: 99, price: {} };
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.getTeamMember.mockResolvedValue({
      teamId: "team-1",
      userId: "user-1",
    });
    mocks.reserveTeamBudget.mockResolvedValue(lease);

    await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );
    const options = mocks.streamObject.mock.calls[0]?.[0];
    await options.onError({ error: new Error("provider unavailable") });

    expect(mocks.settleTeamBudget).toHaveBeenCalledWith(lease, {
      aborted: true,
    });
  });

  it("refunds the reservation when effective model resolution fails before inference", async () => {
    const lease = { reservationId: "lease-3", estimateMicros: 99, price: {} };
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.getTeamMember.mockResolvedValue({
      teamId: "team-1",
      userId: "user-1",
    });
    mocks.reserveTeamBudget.mockResolvedValue(lease);
    mocks.getModelAsync.mockRejectedValue(new Error("model unavailable"));

    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(500);
    expect(mocks.streamObject).not.toHaveBeenCalled();
    expect(mocks.settleTeamBudget).toHaveBeenCalledWith(lease, {
      aborted: true,
    });
  });

  it("does not apply a team reservation when no active team allowance exists", async () => {
    const response = await POST(
      makeRequest(
        JSON.stringify({
          message: "Create an agent",
          chatModel: { provider: "google", model: "Gemini 3 Flash" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getTeamMember).not.toHaveBeenCalled();
    expect(mocks.reserveTeamBudget).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: undefined, userId: "user-1" }),
    );
    expect(mocks.getModelWithFailureFallbackAsync).toHaveBeenCalledOnce();
    expect(mocks.getModelAsync).not.toHaveBeenCalled();
  });
});
