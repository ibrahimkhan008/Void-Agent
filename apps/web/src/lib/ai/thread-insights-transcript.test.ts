import type { ChatMessage } from "app-types/chat";
import { describe, expect, it } from "vitest";
import { fingerprintThreadTranscript } from "./thread-insights-transcript";

const makeMessage = (content: string): ChatMessage => ({
  id: "message-1",
  threadId: "thread-1",
  role: "user",
  parts: [{ type: "text", text: content }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("thread transcript fingerprint", () => {
  it("is stable for the same ordered transcript and changes when message content changes", () => {
    expect(fingerprintThreadTranscript([makeMessage("same")])).toBe(
      fingerprintThreadTranscript([makeMessage("same")]),
    );
    expect(fingerprintThreadTranscript([makeMessage("before")])).not.toBe(
      fingerprintThreadTranscript([makeMessage("after")]),
    );
  });
});
