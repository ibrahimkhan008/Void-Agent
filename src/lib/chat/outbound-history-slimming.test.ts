import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { slimOutboundChatHistory } from "./outbound-history-slimming";

const text = (
  id: string,
  role: UIMessage["role"],
  value: string,
): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

describe("slimOutboundChatHistory", () => {
  it("trims only old ingestion previews and removes their duplicate file part", () => {
    const old: UIMessage = {
      id: "old-user",
      role: "user",
      parts: [
        {
          type: "text",
          text: "x".repeat(2_500),
          ingestionPreview: true,
        } as never,
        {
          type: "file",
          mediaType: "application/pdf",
          url: "https://files.example/report.pdf",
        },
        {
          type: "file",
          mediaType: "image/png",
          url: "https://files.example/chart.png",
        },
      ],
    };
    const recent = [
      text("middle-user", "user", "follow-up"),
      text("recent-user", "user", "new question"),
    ];

    const result = slimOutboundChatHistory([
      text("first-user", "user", "first turn"),
      text("first-answer", "assistant", "ok"),
      old,
      text("old-answer", "assistant", "ok"),
      ...recent,
    ]);

    expect(result[2]).not.toBe(old);
    expect(result[2]?.parts).toHaveLength(2);
    expect(result[2]?.parts[0]).toMatchObject({
      type: "text",
      ingestionPreview: true,
    });
    expect(
      (result[2]?.parts[0] as { text: string }).text.length,
    ).toBeGreaterThan(2_000);
    expect((result[2]?.parts[0] as { text: string }).text).toContain(
      "characters omitted",
    );
    expect(result[2]?.parts[1]).toMatchObject({
      type: "file",
      mediaType: "image/png",
    });
    expect(result[4]).toBe(recent[0]);

    // Send-time projection: caller's persisted/UI transcript remains unchanged.
    expect(old.parts).toHaveLength(3);
    expect((old.parts[0] as { text: string }).text).toBe("x".repeat(2_500));
  });

  it("truncates large settled tool output in old turns but keeps current turns intact", () => {
    const oldAssistant: UIMessage = {
      id: "old-assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-search",
          state: "output-available",
          toolCallId: "call-1",
          input: {},
          output: "result".repeat(600),
        } as never,
      ],
    };
    const latest: UIMessage = {
      id: "latest-assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-search",
          state: "output-available",
          toolCallId: "call-2",
          input: {},
          output: "result".repeat(600),
        } as never,
      ],
    };
    const messages = [
      text("u0", "user", "earlier"),
      oldAssistant,
      text("u1", "user", "old"),
      text("u2", "user", "recent"),
      latest,
    ];

    const result = slimOutboundChatHistory(messages);
    expect((result[1]?.parts[0] as { output: string }).output).toContain(
      "characters omitted",
    );
    expect(result[4]).toBe(latest);
    expect((latest.parts[0] as { output: string }).output).toBe(
      "result".repeat(600),
    );
  });

  it("is deterministic and idempotent", () => {
    const messages = [
      text("u1", "user", "old"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "z".repeat(2_500), ingestionPreview: true },
        ],
      } as unknown as UIMessage,
      text("u2", "user", "recent"),
    ];
    const once = slimOutboundChatHistory(messages);

    expect(slimOutboundChatHistory(messages)).toEqual(once);
    expect(slimOutboundChatHistory(once)).toBe(once);
  });

  it("leaves a short conversation and invalid options unchanged", () => {
    const messages = [
      text("u1", "user", "one"),
      text("a1", "assistant", "two"),
    ];
    expect(slimOutboundChatHistory(messages)).toBe(messages);
    expect(slimOutboundChatHistory(messages, { keepRecentTurns: 0 })).toBe(
      messages,
    );
  });
});
