import { describe, expect, it } from "vitest";
import { MAX_DEVICE_AUDIO_BYTES, deviceAudioHeadersSchema, readBoundedWav } from "./device-audio";

const wav = (payloadBytes = 4) => {
  const bytes = new Uint8Array(12 + payloadBytes);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
};

describe("voice device audio ingress", () => {
  it("validates bounded session and event metadata", () => {
    expect(deviceAudioHeadersSchema.safeParse({ sessionId: "s", eventId: "e" }).success).toBe(true);
    expect(deviceAudioHeadersSchema.safeParse({ sessionId: "s", eventId: "e", ownerId: "spoof" }).success).toBe(false);
  });

  it("accepts a RIFF/WAVE body within the size cap", async () => {
    const request = new Request("https://local.test/audio", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav() });
    expect(await readBoundedWav(request)).toHaveLength(16);
  });

  it("rejects malformed, empty, declared-oversized, and streamed-oversized audio", async () => {
    const malformed = new Request("https://local.test/audio", { method: "POST", body: new Uint8Array(16) });
    expect(await readBoundedWav(malformed)).toBeNull();
    const missingHeader = new Request("https://local.test/audio", { method: "POST", body: new Uint8Array(4) });
    expect(await readBoundedWav(missingHeader)).toBeNull();
    const declared = new Request("https://local.test/audio", { method: "POST", headers: { "content-length": String(MAX_DEVICE_AUDIO_BYTES + 1) }, body: wav() });
    expect(await readBoundedWav(declared)).toBeNull();
    const streamed = new Request("https://local.test/audio", { method: "POST", body: wav(32) });
    expect(await readBoundedWav(streamed, 16)).toBeNull();
  });
});
