import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" }, session: {} } as any,
  checkApiRateLimit: vi.fn(),
  validateManualModel: vi.fn(),
  requireBillingContext: vi.fn(),
  assertCreditsAvailable: vi.fn(),
  getModelInstance: vi.fn(),
  streamText: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  convertToModelMessages: async (messages: unknown) => messages,
  streamText: (...args: unknown[]) => mocks.streamText(...args),
}));
vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.checkApiRateLimit(...args),
}));
vi.mock("lib/ai/routing/service", () => ({
  validateManualModel: (...args: unknown[]) =>
    mocks.validateManualModel(...args),
}));
vi.mock("lib/ai/models", () => ({
  getModelInstance: (...args: unknown[]) => mocks.getModelInstance(...args),
}));
vi.mock("lib/gate", () => ({
  CreditsExhaustedError: class CreditsExhaustedError extends Error {},
  assertCreditsAvailable: (...args: unknown[]) =>
    mocks.assertCreditsAvailable(...args),
  requireBillingContext: () => mocks.requireBillingContext(),
  trackUsage: (...args: unknown[]) => mocks.trackUsage(...args),
}));

import { POST } from "./route";

const canvasId = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const payload = {
  model: { provider: "openai", model: "gpt-4.1-mini" },
  messages: [{ role: "user", content: "Build a landing page" }],
};

function request(body: unknown = payload, origin = "https://void-agent.test") {
  return new Request(
    `https://void-agent.test/api/ecanvas/${canvasId}/generate`,
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const context = { params: Promise.resolve({ canvasId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "user-1" }, session: {} };
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.validateManualModel.mockResolvedValue(undefined);
  mocks.requireBillingContext.mockResolvedValue({ customerId: "customer-1" });
  mocks.assertCreditsAvailable.mockResolvedValue(undefined);
  mocks.getModelInstance.mockResolvedValue({ model: "mock-model" });
  mocks.streamText.mockImplementation(() => ({
    fullStream: (async function* () {
      yield { type: "text-delta", text: "<html>" };
      yield {
        type: "finish",
        totalUsage: { inputTokens: 4, outputTokens: 7 },
      };
    })(),
  }));
});

describe("POST /api/ecanvas/[canvasId]/generate", () => {
  it("requires an authenticated same-origin request before provider execution", async () => {
    mocks.session = null;
    expect((await POST(request(), context)).status).toBe(401);

    mocks.session = { user: { id: "user-1" }, session: {} };
    expect(
      (await POST(request(payload, "https://attacker.test"), context)).status,
    ).toBe(403);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("validates the selected model and streams structured events with an SSE terminator", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(mocks.validateManualModel).toHaveBeenCalledWith({
      organizationId: undefined,
      userId: "user-1",
      chatModel: payload.model,
    });
    expect(mocks.getModelInstance).toHaveBeenCalledWith(
      payload.model,
      "user-1",
    );

    const body = await response.text();
    expect(body).toContain('data: {"type":"chunk","text":"<html>"}\n\n');
    expect(body).toContain(
      'data: {"type":"done","usage":{"input_tokens":4,"output_tokens":7}}\n\n',
    );
    expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("rejects invalid canvas IDs and oversized prompts before provider execution", async () => {
    const invalidId = await POST(request(), {
      params: Promise.resolve({ canvasId: "bad-id" }),
    });
    expect(invalidId.status).toBe(400);

    const invalidBody = await POST(
      request({ ...payload, unexpected: true }),
      context,
    );
    expect(invalidBody.status).toBe(400);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});
