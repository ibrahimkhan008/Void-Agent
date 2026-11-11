import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  generateObjectResilient: vi.fn(),
  getModel: vi.fn(() => "fallback-model"),
}));
vi.mock("lib/ai/resilient-object", () => ({
  generateObjectResilient: mocks.generateObjectResilient,
}));
vi.mock("lib/ai/models", () => ({
  projectBrainModelId: "insights-model",
  customModelProvider: { getModel: mocks.getModel },
}));

import type { ChatMessage } from "app-types/chat";
import { generateThreadInsights } from "./thread-insights";

const message = (id: string, content: string): ChatMessage => ({
  id,
  threadId: "thread-1",
  role: "user",
  parts: [{ type: "text", text: content }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("thread insights generation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips model calls for empty transcripts", async () => {
    await expect(generateThreadInsights({ messages: [] })).resolves.toEqual({
      summary: "",
      decisions: [],
      actionItems: [],
    });
    expect(mocks.generateObjectResilient).not.toHaveBeenCalled();
  });

  it("generates bounded insights from the provided transcript and forwards cancellation", async () => {
    mocks.generateObjectResilient.mockResolvedValue({
      object: {
        summary: "The user chose PostgreSQL for the service.",
        decisions: ["Use PostgreSQL for persistence."],
        actionItems: ["Create the initial schema migration."],
      },
    });
    const signal = AbortSignal.timeout(1_000);
    const result = await generateThreadInsights({
      title: "Service planning",
      messages: [message("m1", "We should use PostgreSQL.")],
      totalMessageCount: 1,
      abortSignal: signal,
    });
    expect(result.decisions).toEqual(["Use PostgreSQL for persistence."]);
    expect(mocks.generateObjectResilient).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "insights-model",
        fallbackModel: "fallback-model",
        abortSignal: signal,
      }),
    );
    const prompt = mocks.generateObjectResilient.mock.calls[0][0]
      .prompt as string;
    expect(JSON.parse(prompt)).toMatchObject({
      threadTitle: "Service planning",
      includedMessages: [
        { role: "user", content: "We should use PostgreSQL." },
      ],
    });
  });

  it("rejects invalid model output instead of returning or saving invented structure", async () => {
    mocks.generateObjectResilient.mockResolvedValue({
      object: {
        summary: "",
        decisions: [
          "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one",
        ],
        actionItems: [],
      },
    });
    await expect(
      generateThreadInsights({ messages: [message("m1", "text")] }),
    ).rejects.toThrow();
  });

  it("serializes transcripts as valid JSON within the prompt character budget", async () => {
    mocks.generateObjectResilient.mockResolvedValue({
      object: { summary: "", decisions: [], actionItems: [] },
    });
    const messages = Array.from({ length: 50 }, (_, index) =>
      message(`m-${index}`, "long transcript text ".repeat(400)),
    );
    await generateThreadInsights({ messages, totalMessageCount: 100 });
    const prompt = mocks.generateObjectResilient.mock.calls[0][0]
      .prompt as string;
    expect(prompt.length).toBeLessThanOrEqual(48_000);
    expect(JSON.parse(prompt).truncated).toBe(true);
  });
});
