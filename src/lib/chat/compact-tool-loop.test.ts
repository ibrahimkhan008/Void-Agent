import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES,
  compactCurrentToolLoop,
  compactToolLoopMessages,
} from "./compact-tool-loop";

const loop = (steps: number): ModelMessage[] =>
  Array.from({ length: steps }, (_, index) => [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: `call-${index}`,
          toolName: "lookup",
          input: { index },
        },
        { type: "reasoning", text: `reasoning-${index}` },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: `call-${index}`,
          toolName: "lookup",
          output: {
            type: "json",
            value: { text: `result-${index}` },
          },
        },
      ],
    },
  ]).flat() as ModelMessage[];

function orphanedToolResults(messages: ModelMessage[]): string[] {
  const calls = new Set<string>();
  const results: string[] = [];
  for (const message of messages) {
    if (
      (message.role !== "assistant" && message.role !== "tool") ||
      typeof message.content === "string"
    )
      continue;
    for (const part of message.content) {
      if (part.type === "tool-call") calls.add(part.toolCallId);
      if (part.type === "tool-result") results.push(part.toolCallId);
    }
  }
  return results.filter((id) => !calls.has(id));
}

describe("compactToolLoopMessages", () => {
  it("prunes older loop output while retaining recent complete tool pairs", () => {
    const messages = loop(10);
    const compacted = compactToolLoopMessages(messages);

    expect(compacted).toBeDefined();
    expect(compacted!.length).toBeLessThan(messages.length);
    expect(orphanedToolResults(compacted!)).toEqual([]);
    expect(compacted!.slice(-COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES)).toEqual(
      messages.slice(-COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES),
    );
    expect(JSON.stringify(compacted)).not.toContain("reasoning-0");
  });

  it("does not prune a result whose call belongs to the initial conversation", () => {
    const messages: ModelMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "initial-call",
            toolName: "lookup",
            output: {
              type: "text",
              value: "large",
            },
          },
        ],
      },
      ...loop(8),
    ];
    expect(compactToolLoopMessages(messages)).toBeUndefined();
  });

  it("does not mutate the caller's messages", () => {
    const messages = loop(10);
    const before = structuredClone(messages);
    compactToolLoopMessages(messages);
    expect(messages).toEqual(before);
  });

  it("preserves the submitted transcript prefix and compacts only this run", () => {
    const initial: ModelMessage[] = [
      { role: "user", content: "historic prompt" },
      {
        role: "assistant",
        content: [{ type: "text", text: "historic answer" }],
      },
    ];
    const response = loop(8);
    const combined = [...initial, ...response];
    const compacted = compactCurrentToolLoop(initial, combined);
    expect(compacted?.slice(0, initial.length)).toEqual(initial);
    expect(compacted?.length).toBeLessThan(combined.length);
    expect(compactCurrentToolLoop(initial, initial)).toBeUndefined();
  });

  it("returns undefined when there is nothing to compact", () => {
    expect(compactToolLoopMessages(loop(2))).toBeUndefined();
    expect(compactToolLoopMessages([])).toBeUndefined();
  });
});
