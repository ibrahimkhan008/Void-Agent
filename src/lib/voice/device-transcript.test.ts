import { describe, expect, it } from "vitest";
import { deviceTranscriptSchema, voiceDeviceUuid } from "./device-transcript";

describe("voice device transcript contract", () => {
  it("bounds transcript data and rejects unknown fields", () => {
    expect(deviceTranscriptSchema.safeParse({ sessionId: "s1", eventId: "e1", text: "hello" }).success).toBe(true);
    expect(deviceTranscriptSchema.safeParse({ sessionId: "s1", eventId: "e1", text: " ".repeat(5) }).success).toBe(false);
    expect(deviceTranscriptSchema.safeParse({ sessionId: "s1", eventId: "e1", text: "hello", deviceId: "spoof" }).success).toBe(false);
    expect(deviceTranscriptSchema.safeParse({ sessionId: "s1", eventId: "e1", text: "x".repeat(8_001) }).success).toBe(false);
  });

  it("creates stable, valid UUIDs separated by their namespace", () => {
    const first = voiceDeviceUuid("thread", "device-1", "session-1");
    expect(first).toBe(voiceDeviceUuid("thread", "device-1", "session-1"));
    expect(first).not.toBe(voiceDeviceUuid("thread", "device-2", "session-1"));
    expect(voiceDeviceUuid("thread", "device", "s\u0000e", "v")).not.toBe(voiceDeviceUuid("thread", "device", "s", "e\u0000v"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
