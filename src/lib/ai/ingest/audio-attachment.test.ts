import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAudioAttachmentPreviewParts } from "./audio-attachment";

const transcribe = vi.fn();
const wav = Buffer.from("RIFF0000WAVEpayload");
const userId = "user-1";
const key = "uploads/user-1/recording.wav";
const ownedAttachment = {
  type: "file" as const,
  url: `https://storage.example.test/${key}`,
  mediaType: "audio/wav",
  filename: "recording.wav",
};

function storage(overrides: { size?: number; contentType?: string; bytes?: Uint8Array } = {}) {
  return {
    getMetadata: vi.fn().mockResolvedValue({
      contentType: overrides.contentType ?? "audio/wav",
      size: overrides.size ?? wav.byteLength,
    }),
    downloadLimited: vi.fn().mockResolvedValue(overrides.bytes ?? wav),
  };
}

describe("buildAudioAttachmentPreviewParts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transcribe.mockResolvedValue("Please summarize the recording");
  });

  it("adds a clearly labeled untrusted transcript for an explicitly attached owned WAV", async () => {
    const files = storage();
    const parts = await buildAudioAttachmentPreviewParts([ownedAttachment], userId, files, transcribe);
    expect(parts).toEqual([{
      type: "text",
      text: '[Untrusted transcript from audio attachment "recording.wav":\nPlease summarize the recording\nEnd of untrusted audio transcript.]',
      audioIngestionPreview: true,
    }]);
    expect(files.getMetadata).toHaveBeenCalledWith(key);
    expect(files.downloadLimited).toHaveBeenCalledWith(key, 1_000_000);
    expect(transcribe).toHaveBeenCalledWith(wav);
  });

  it("does not transcribe non-audio, foreign-owner, or oversized attachments", async () => {
    const files = storage({ size: 1_000_001 });
    const foreign = { ...ownedAttachment, url: "https://storage.example.test/uploads/user-2/private.wav" };
    const nonAudio = { ...ownedAttachment, mediaType: "application/pdf" };
    const oversized = { ...ownedAttachment, url: "https://storage.example.test/uploads/user-1/large.wav" };
    await buildAudioAttachmentPreviewParts([nonAudio, foreign, oversized], userId, files, transcribe);
    expect(transcribe).not.toHaveBeenCalled();
    expect(files.getMetadata).toHaveBeenCalledTimes(1);
    expect(files.downloadLimited).not.toHaveBeenCalled();
  });

  it("does not fetch arbitrary external audio URLs", async () => {
    const files = storage();
    await buildAudioAttachmentPreviewParts([{
      ...ownedAttachment,
      type: "source-url",
      url: "https://attacker.example.test/audio.wav",
    }], userId, files, transcribe);
    expect(files.getMetadata).not.toHaveBeenCalled();
    expect(files.downloadLimited).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects content whose stored type or bytes do not match WAV", async () => {
    const wrongType = storage({ contentType: "audio/mpeg" });
    await buildAudioAttachmentPreviewParts([ownedAttachment], userId, wrongType, transcribe);
    const wrongBytes = storage({ bytes: Buffer.from("not a wav") });
    await buildAudioAttachmentPreviewParts([ownedAttachment], userId, wrongBytes, transcribe);
    expect(transcribe).not.toHaveBeenCalled();
    expect(wrongBytes.downloadLimited).toHaveBeenCalledTimes(1);
  });
});
