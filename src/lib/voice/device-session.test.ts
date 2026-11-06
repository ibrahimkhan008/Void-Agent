import { describe, expect, it } from "vitest";
import {
  assembleDeviceVoiceTranscript,
  deviceVoiceSegmentSchema,
  deviceVoiceSessionStartSchema,
} from "./device-session";

describe("voice device session contracts", () => {
  it("bounds session ids and requires exact start payloads", () => {
    expect(
      deviceVoiceSessionStartSchema.safeParse({ sessionId: "s-1" }).success,
    ).toBe(true);
    expect(
      deviceVoiceSessionStartSchema.safeParse({
        sessionId: "s-1",
        userId: "spoof",
      }).success,
    ).toBe(false);
    expect(
      deviceVoiceSessionStartSchema.safeParse({ sessionId: "x".repeat(121) })
        .success,
    ).toBe(false);
  });

  it("bounds transcript segments and rejects extra device identity fields", () => {
    const segment = {
      eventId: "event-1",
      sequenceNumber: 0,
      text: "Hello",
      language: "en-US",
    };
    expect(deviceVoiceSegmentSchema.safeParse(segment).success).toBe(true);
    expect(
      deviceVoiceSegmentSchema.safeParse({ ...segment, deviceId: "spoof" })
        .success,
    ).toBe(false);
    expect(
      deviceVoiceSegmentSchema.safeParse({ ...segment, sequenceNumber: 500 })
        .success,
    ).toBe(false);
    expect(
      deviceVoiceSegmentSchema.safeParse({ ...segment, text: "x".repeat(8001) })
        .success,
    ).toBe(false);
  });

  it("assembles segments in caller-supplied order and bounds the final transcript", () => {
    expect(
      assembleDeviceVoiceTranscript([{ text: " first " }, { text: "second" }]),
    ).toBe("first\nsecond");
    const result = assembleDeviceVoiceTranscript([
      { text: "x".repeat(25_000) },
    ]);
    expect(result.length).toBe(24_000);
    expect(result.endsWith("…")).toBe(true);
  });
});
