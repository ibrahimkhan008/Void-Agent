import { describe, expect, it } from "vitest";
import {
  encodeVoiceInboxCursor,
  parseVoiceInboxCursor,
  voiceTranscriptText,
} from "./voice-inbox";

describe("voice inbox helpers", () => {
  it("round trips a stable cursor and rejects malformed or non-canonical dates", () => {
    const cursor = { createdAt: "2026-11-07T12:00:00.000Z", id: "message-1" };
    expect(parseVoiceInboxCursor(encodeVoiceInboxCursor(cursor))).toEqual(
      cursor,
    );
    expect(parseVoiceInboxCursor("not-base64-json")).toBeNull();
    expect(
      parseVoiceInboxCursor(
        Buffer.from(
          JSON.stringify({ createdAt: "2026-11-07", id: "x" }),
        ).toString("base64url"),
      ),
    ).toBeNull();
    expect(parseVoiceInboxCursor("x".repeat(513))).toBeNull();
  });

  it("extracts only bounded plain-text transcript parts", () => {
    expect(
      voiceTranscriptText([
        { type: "text", text: "Remember this" },
        { type: "image", image: "data:secret" },
        { type: "text", text: "for later" },
      ]),
    ).toBe("Remember this\nfor later");
    expect(
      voiceTranscriptText([{ type: "text", text: "x".repeat(9_000) }]),
    ).toHaveLength(8_000);
    expect(voiceTranscriptText({ text: "not an array" })).toBe("");
  });
});
