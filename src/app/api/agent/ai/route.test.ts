import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  loadAppDefaultTools: vi.fn(),
  mcpTools: vi.fn(),
  selectExecuteAbility: vi.fn(),
  getModelWithFailureFallbackAsync: vi.fn(),
  streamObject: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("ai", () => ({ streamObject: mocks.streamObject }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("consola/utils", () => ({ colorize: vi.fn((_, value) => value) }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: mocks.getModelWithFailureFallbackAsync,
  },
}));
vi.mock("lib/ai/prompts", () => ({
  buildAgentGenerationPrompt: vi.fn((names) => `tools:${names.join(",")}`),
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: mocks.mcpTools },
}));
vi.mock("lib/db/repository", () => ({
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
    withDefaults: vi.fn(() => ({ info: vi.fn(), error: mocks.loggerError })),
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
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.loadAppDefaultTools.mockResolvedValue({});
    mocks.mcpTools.mockResolvedValue({});
    mocks.selectExecuteAbility.mockResolvedValue([]);
    mocks.getModelWithFailureFallbackAsync.mockResolvedValue({ id: "model" });
    mocks.streamObject.mockReturnValue({
      toTextStreamResponse: () => Response.json({ stream: true }),
    });
  });

  it("requires a session before reading or generating from the request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(makeRequest(JSON.stringify({ message: "hello" })));

    expect(response.status).toBe(401);
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("rate limits agent generation per authenticated user", async () => {
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 2_000 });
    const response = await POST(makeRequest(JSON.stringify({ message: "hello" })));

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
});
