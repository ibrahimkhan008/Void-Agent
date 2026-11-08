import type { ChatExport } from "app-types/chat-export";
import { describe, expect, test } from "vitest";
import {
  createPublicShareToken,
  hashPublicShareToken,
  sanitizePublicChatMessages,
} from "./public-share";

describe("public chat share", () => {
  test("creates an unguessable token and stores only a one-way digest", () => {
    const first = createPublicShareToken();
    const second = createPublicShareToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.tokenHash).toBe(hashPublicShareToken(first.token));
    expect(second.token).not.toBe(first.token);
  });

  test("rejects malformed tokens before hashing", () => {
    expect(hashPublicShareToken("short-token")).toBeNull();
    expect(hashPublicShareToken("x".repeat(43))).not.toBeNull();
  });

  test("shares only user and assistant text with private links and metadata removed", () => {
    const messages = [
      {
        id: "user-private-id",
        role: "user",
        parts: [
          { type: "text", text: "See https://example.com/public" },
          {
            type: "text",
            text: "Private https://host/api/storage/download?token=secret",
          },
          { type: "file", url: "https://private.example/file?token=secret" },
          { type: "tool-run", toolCallId: "private-tool" },
        ],
        metadata: {
          runId: "private-run-id",
          chatModel: { provider: "p", model: "m" },
        },
      },
      {
        id: "assistant-private-id",
        role: "assistant",
        parts: [{ type: "text", text: "Answer" }],
        metadata: { usage: { inputTokens: 9 } },
      },
      {
        id: "system-private-id",
        role: "system",
        parts: [{ type: "text", text: "System prompt" }],
      },
    ] as unknown as ChatExport["messages"];

    expect(sanitizePublicChatMessages(messages)).toEqual([
      {
        id: "shared-1",
        role: "user",
        parts: [
          { type: "text", text: "See https://example.com/public" },
          { type: "text", text: "Private [private link removed]" },
        ],
      },
      {
        id: "shared-2",
        role: "assistant",
        parts: [{ type: "text", text: "Answer" }],
      },
    ]);
  });
});
