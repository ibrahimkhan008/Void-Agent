import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  getTeamMember: vi.fn(),
  selectAgents: vi.fn(),
  checkAccess: vi.fn(),
  selectAgentById: vi.fn(),
  ensureDynamicProvidersHydrated: vi.fn(),
  getEnabledAgentModelCatalog: vi.fn(),
  resolveAgentChatModel: vi.fn(),
  getModelsConfig: vi.fn(),
  getUserPreferences: vi.fn(),
  getModelAsync: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  reserveBudget: vi.fn(),
  settleBudget: vi.fn(),
  generateText: vi.fn(),
  loadMcpTools: vi.fn(),
  mcpExecute: vi.fn(),
  buildSpeechSystemPrompt: vi.fn(),
  loggerError: vi.fn(),
  TeamBudgetExceededError: class TeamBudgetExceededError extends Error {},
  TeamBudgetAuthorizationError: class TeamBudgetAuthorizationError extends Error {},
  TeamBudgetPolicyError: class TeamBudgetPolicyError extends Error {},
  TeamBudgetModelUnpricedError: class TeamBudgetModelUnpricedError extends Error {},
  TeamBudgetCurrencyMismatchError: class TeamBudgetCurrencyMismatchError extends Error {},
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  jsonSchema: (schema: unknown) => schema,
  tool: (definition: unknown) => definition,
}));
vi.mock("@/app/api/chat/shared.chat", () => ({
  loadMcpTools: mocks.loadMcpTools,
  getVoiceMcpToolDefinition: () => ({
    description: "Create or update a record.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, status: { type: "string" } },
      required: ["id", "status"],
    },
  }),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgents: mocks.selectAgents,
    checkAccess: mocks.checkAccess,
    selectAgentById: mocks.selectAgentById,
  },
  siteConfigRepository: { getConfig: mocks.getModelsConfig },
  teamRepository: { getTeamMember: mocks.getTeamMember },
}));
vi.mock("lib/ai/agent/pinned-model", () => ({
  resolveAgentChatModel: mocks.resolveAgentChatModel,
  getEnabledAgentModelCatalog: mocks.getEnabledAgentModelCatalog,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelAsync: mocks.getModelAsync,
    getModelWithFailureFallbackAsync: mocks.getModelWithFailureFallbackAsync,
  },
  ensureDynamicProvidersHydrated: mocks.ensureDynamicProvidersHydrated,
}));
vi.mock("lib/ai/prompts", () => ({
  buildSpeechSystemPrompt: mocks.buildSpeechSystemPrompt,
}));
vi.mock("lib/user/server", () => ({
  getUserPreferences: mocks.getUserPreferences,
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
  reserveTeamBudgetForAiRequest: mocks.reserveBudget,
  settleTeamBudgetForAiRequest: mocks.settleBudget,
}));
vi.mock("lib/logger", () => ({
  default: { withDefaults: () => ({ error: mocks.loggerError }) },
}));

import { POST } from "./route";

const request = (
  body: unknown = { agent: "Researcher", question: "Summarize this." },
) =>
  new Request("https://void.test/api/voice/run-agent", {
    method: "POST",
    headers: {
      origin: "https://void.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" }, session: {} });
  mocks.sameOrigin.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.getTeamMember.mockResolvedValue({ teamId: "team-1", userId: "user-1" });
  mocks.selectAgents.mockResolvedValue([{ id: "agent-1", name: "Researcher" }]);
  mocks.checkAccess.mockResolvedValue(true);
  mocks.selectAgentById.mockResolvedValue({
    id: "agent-1",
    name: "Researcher",
    userId: "user-1",
    instructions: {
      role: "Research assistant",
      systemPrompt: "Be concise.",
      mentions: [],
    },
  });
  mocks.ensureDynamicProvidersHydrated.mockResolvedValue(undefined);
  mocks.getEnabledAgentModelCatalog.mockResolvedValue([
    {
      provider: "google",
      model: "Gemini 3 Flash",
      value: "google/Gemini 3 Flash",
    },
  ]);
  mocks.resolveAgentChatModel.mockReturnValue(undefined);
  mocks.getModelsConfig.mockResolvedValue({
    providers: { google: { enabled: true, defaultModel: "Gemini 3 Flash" } },
  });
  mocks.getUserPreferences.mockResolvedValue(null);
  mocks.getModelAsync.mockResolvedValue({ id: "budgeted-model" });
  mocks.getModelWithFailureFallbackAsync.mockResolvedValue({ id: "model" });
  mocks.reserveBudget.mockResolvedValue(undefined);
  mocks.settleBudget.mockResolvedValue(undefined);
  mocks.buildSpeechSystemPrompt.mockReturnValue("agent prompt");
  mocks.generateText.mockResolvedValue({
    text: "A useful answer.",
    toolCalls: [],
    usage: { inputTokens: 12, outputTokens: 8 },
  });
  mocks.loadMcpTools.mockResolvedValue({});
});

describe("POST /api/voice/run-agent", () => {
  it("requires authentication, same-origin and per-user rate allowance", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("validates bounded arguments and rejects agents the owner cannot access", async () => {
    expect((await POST(request({ agent: "", question: "x" }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          request({ agent: "Researcher", question: "x".repeat(2_001) }),
        )
      ).status,
    ).toBe(400);
    mocks.checkAccess.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("resolves a unique partial spoken agent name", async () => {
    mocks.selectAgents.mockResolvedValue([
      { id: "agent-1", name: "Researcher" },
      { id: "agent-2", name: "Support" },
    ]);
    mocks.selectAgentById.mockImplementation(async (id: string) => ({
      id,
      name: id === "agent-1" ? "Researcher" : "Support",
      userId: "user-1",
      instructions: { role: "Research assistant", systemPrompt: "Be concise." },
    }));

    const response = await POST(
      request({ agent: "research", question: "Summarize this." }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ agent: "Researcher" });
    expect(mocks.checkAccess).toHaveBeenCalledWith("agent-1", "user-1");
  });

  it("rejects ambiguous partial spoken agent names without executing either agent", async () => {
    mocks.selectAgents.mockResolvedValue([
      { id: "agent-sales", name: "Sales Agent" },
      { id: "agent-sales-ops", name: "Sales Operations" },
    ]);

    const response = await POST(
      request({ agent: "sales", question: "Summarize this." }),
    );

    expect(response.status).toBe(404);
    expect(mocks.checkAccess).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("runs a no-tools delegated turn with the agent's configured model", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      agentId: "agent-1",
      agent: "Researcher",
      answer: "A useful answer.",
      proposals: [],
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: "model" },
        system: expect.stringContaining(
          "External MCP actions are proposal-only",
        ),
        prompt: "Summarize this.",
        maxOutputTokens: 1_000,
      }),
    );
    expect(mocks.reserveBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: undefined,
        userId: "user-1",
        model: { provider: "google", model: "Gemini 3 Flash" },
        idempotencyScope: "voice-agent-run",
      }),
    );
  });

  it("returns only schema-only MCP proposals and never executes a tool during proposal", async () => {
    const serverId = "00000000-0000-4000-8000-000000000010";
    const fingerprint = "a".repeat(64);
    const toolName = "crm:update_record";
    const mcpTool = {
      _mcpServerId: serverId,
      _mcpServerName: "CRM",
      _originToolName: "update_record",
      _approvalConfigFingerprint: fingerprint,
      execute: mocks.mcpExecute,
    };
    mocks.selectAgentById.mockResolvedValue({
      id: "agent-1",
      name: "Researcher",
      userId: "user-1",
      instructions: {
        role: "Research assistant",
        systemPrompt: "Be concise.",
        mentions: [{ type: "mcpTool", serverId, name: "update_record" }],
      },
    });
    mocks.loadMcpTools.mockResolvedValue({ [toolName]: mcpTool });
    mocks.generateText.mockImplementation(async (input: any) => {
      expect(input.tools[toolName].execute).toBeUndefined();
      expect(input.tools[toolName].inputSchema).toBeDefined();
      return {
        text: "I prepared the requested CRM update.",
        toolCalls: [
          {
            toolName,
            input: { id: "42", status: "active" },
          },
        ],
        usage: { inputTokens: 20, outputTokens: 10 },
      };
    });

    const response = await POST(
      request({ agent: "Researcher", question: "Activate record 42." }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.loadMcpTools).toHaveBeenCalledWith({
      mentions: [{ type: "mcpTool", serverId, name: "update_record" }],
      userId: "user-1",
      userRole: undefined,
    });
    expect(body.proposals).toEqual([
      {
        serverId,
        serverName: "CRM",
        toolName: "update_record",
        payload: { id: "42", status: "active" },
        serverConfigFingerprint: fingerprint,
      },
    ]);
    expect(body.answer).toBe("Researcher prepared 1 action for your review.");
    expect(mocks.mcpExecute).not.toHaveBeenCalled();
  });

  it("enforces monthly team budget and settles provider usage", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.reserveBudget.mockResolvedValue({ reservationId: "reservation-1" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.getTeamMember).toHaveBeenCalledWith("team-1", "user-1");
    expect(mocks.getModelAsync).toHaveBeenCalledWith({
      provider: "google",
      model: "Gemini 3 Flash",
    });
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      { reservationId: "reservation-1" },
      { usage: { inputTokens: 12, outputTokens: 8 } },
    );
  });

  it("returns a budget denial without calling the provider", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.reserveBudget.mockRejectedValue(
      new mocks.TeamBudgetExceededError("Monthly allowance exhausted"),
    );
    const response = await POST(request());
    expect(response.status).toBe(402);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("refunds a reservation on provider failure and redacts provider details", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeTeamId: "team-1" },
    });
    mocks.reserveBudget.mockResolvedValue({ reservationId: "reservation-1" });
    mocks.generateText.mockRejectedValue(new Error("provider key sk-secret"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The requested agent could not answer just now.",
    });
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      { reservationId: "reservation-1" },
      { aborted: true },
    );
  });
});
