import { describe, expect, it } from "vitest";
import { getChatAudioDurationSeconds } from "./audio-metadata";

function pcmWav(durationSeconds: number) {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const dataSize = durationSeconds * byteRate;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(byteRate, 28);
  bytes.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  bytes.writeUInt16LE(bitsPerSample, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

describe("getChatAudioDurationSeconds", () => {
  it("reads actual WAV duration for the synchronous provider boundary", async () => {
    await expect(
      getChatAudioDurationSeconds(pcmWav(12), "audio/wav"),
    ).resolves.toBe(12);
    await expect(
      getChatAudioDurationSeconds(pcmWav(31), "audio/wav"),
    ).resolves.toBe(31);
  });

  it("returns unknown for malformed or unsupported audio rather than guessing", async () => {
    await expect(
      getChatAudioDurationSeconds(Buffer.from("not audio"), "audio/mpeg"),
    ).resolves.toBeNull();
  });
});
