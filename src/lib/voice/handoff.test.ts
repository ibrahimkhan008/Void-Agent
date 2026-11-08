import { describe, expect, it } from "vitest";
import { getVoiceTranscriptForHandoff, isCurrentVoiceRequest } from "./handoff";

const valid = {
  userId: "owner-1",
  requestedUserId: "owner-1",
  threadId: "thread-1",
  messageId: "message-1",
  message: {
    id: "message-1",
    threadId: "thread-1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Summarize the new project notes" }],
    metadata: { source: "voice_device" as const },
  },
};

describe("voice transcript handoff contract", () => {
  it("returns bounded plain text only for the owner's saved voice messages", () => {
    expect(getVoiceTranscriptForHandoff(valid)).toBe(
      "Summarize the new project notes",
    );
    expect(
      getVoiceTranscriptForHandoff({ ...valid, requestedUserId: "other" }),
    ).toBeNull();
    expect(
      getVoiceTranscriptForHandoff({
        ...valid,
        message: { ...valid.message, metadata: {} },
      }),
    ).toBeNull();
    expect(
      getVoiceTranscriptForHandoff({
        ...valid,
        message: {
          ...valid.message,
          metadata: { source: "voice_realtime" },
        },
      }),
    ).toBe("Summarize the new project notes");
    expect(
      getVoiceTranscriptForHandoff({
        ...valid,
        message: { ...valid.message, threadId: "another-thread" },
      }),
    ).toBeNull();
    expect(
      getVoiceTranscriptForHandoff({
        ...valid,
        message: {
          ...valid.message,
          parts: [{ type: "text", text: "x".repeat(30_000) }],
        },
      }),
    ).toHaveLength(24_000);
  });
});

describe("voice request generation guard", () => {
  it("accepts only results for the current thread and latest request", () => {
    expect(
      isCurrentVoiceRequest({
        requestedIdentity: "thread-a",
        currentIdentity: "thread-a",
        requestedGeneration: 4,
        currentGeneration: 4,
      }),
    ).toBe(true);
    expect(
      isCurrentVoiceRequest({
        requestedIdentity: "thread-a",
        currentIdentity: "thread-b",
        requestedGeneration: 4,
        currentGeneration: 4,
      }),
    ).toBe(false);
    expect(
      isCurrentVoiceRequest({
        requestedIdentity: "thread-a",
        currentIdentity: "thread-a",
        requestedGeneration: 4,
        currentGeneration: 5,
      }),
    ).toBe(false);
  });
});
