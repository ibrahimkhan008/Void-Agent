import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAudioAttachmentPreviewParts } from "./audio-attachment";

const transcribe = vi.fn();
const getDuration = vi.fn();
const wav = Buffer.from("RIFF0000WAVEpayload");
const userId = "user-1";
const key = "uploads/user-1/recording.wav";
const ownedAttachment = {
  type: "file" as const,
  url: `https://storage.example.test/${key}`,
  mediaType: "audio/wav",
  filename: "recording.wav",
};

function storage(
  overrides: { size?: number; contentType?: string; bytes?: Uint8Array } = {},
) {
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
    getDuration.mockResolvedValue(10);
  });

  it("adds a clearly labeled untrusted transcript for an explicitly attached owned WAV", async () => {
    const files = storage();
    const parts = await buildAudioAttachmentPreviewParts(
      [ownedAttachment],
      userId,
      files,
      transcribe,
      undefined,
      getDuration,
    );
    expect(parts).toEqual([
      {
        type: "text",
        text: '[Untrusted transcript from audio attachment "recording.wav":\nPlease summarize the recording\nEnd of untrusted audio transcript.]',
        audioIngestionPreview: true,
      },
    ]);
    expect(files.getMetadata).toHaveBeenCalledWith(key);
    expect(files.downloadLimited).toHaveBeenCalledWith(key, 15 * 1024 * 1024);
    expect(transcribe).toHaveBeenCalledWith({
      bytes: wav,
      mimeType: "audio/wav",
      filename: "recording.wav",
      durationSeconds: 10,
      signal: undefined,
    });
  });

  it("does not transcribe non-audio, foreign-owner, or oversized attachments", async () => {
    const files = storage({ size: 15 * 1024 * 1024 + 1 });
    const foreign = {
      ...ownedAttachment,
      url: "https://storage.example.test/uploads/user-2/private.wav",
    };
    const nonAudio = { ...ownedAttachment, mediaType: "application/pdf" };
    const oversized = {
      ...ownedAttachment,
      url: "https://storage.example.test/uploads/user-1/large.wav",
    };
    await buildAudioAttachmentPreviewParts(
      [nonAudio, foreign, oversized],
      userId,
      files,
      transcribe,
      undefined,
      getDuration,
    );
    expect(transcribe).not.toHaveBeenCalled();
    expect(files.getMetadata).toHaveBeenCalledTimes(1);
    expect(files.downloadLimited).not.toHaveBeenCalled();
  });

  it("does not fetch arbitrary external audio URLs", async () => {
    const files = storage();
    await buildAudioAttachmentPreviewParts(
      [
        {
          ...ownedAttachment,
          type: "source-url",
          url: "https://attacker.example.test/audio.wav",
        },
      ],
      userId,
      files,
      transcribe,
      undefined,
      getDuration,
    );
    expect(files.getMetadata).not.toHaveBeenCalled();
    expect(files.downloadLimited).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("transcribes supported uploaded audio formats with verified stored MIME", async () => {
    const examples = [
      {
        mime: "audio/mpeg",
        bytes: Buffer.from("ID3payload"),
        filename: "speech.mp3",
      },
      {
        mime: "audio/ogg",
        bytes: Buffer.from("OggSpayload"),
        filename: "speech.ogg",
      },
      {
        mime: "audio/mp4",
        bytes: Buffer.from("0000ftypM4Apayload"),
        filename: "speech.m4a",
      },
      {
        mime: "audio/webm",
        bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
        filename: "speech.webm",
      },
    ];
    for (const example of examples) {
      const files = storage({
        contentType: example.mime,
        bytes: example.bytes,
      });
      const parts = await buildAudioAttachmentPreviewParts(
        [
          {
            ...ownedAttachment,
            mediaType: example.mime,
            filename: example.filename,
          },
        ],
        userId,
        files,
        transcribe,
        undefined,
        getDuration,
      );
      expect(parts[0]?.text).toContain(
        "Untrusted transcript from audio attachment",
      );
      expect(transcribe).toHaveBeenLastCalledWith({
        bytes: example.bytes,
        mimeType: example.mime,
        filename: example.filename,
        durationSeconds: 10,
        signal: undefined,
      });
    }
    expect(transcribe).toHaveBeenCalledTimes(examples.length);
  });

  it("rejects content whose stored type or bytes do not match the attachment", async () => {
    const wrongType = storage({ contentType: "audio/mpeg" });
    await buildAudioAttachmentPreviewParts(
      [ownedAttachment],
      userId,
      wrongType,
      transcribe,
      undefined,
      getDuration,
    );
    const wrongBytes = storage({ bytes: Buffer.from("not a wav") });
    await buildAudioAttachmentPreviewParts(
      [ownedAttachment],
      userId,
      wrongBytes,
      transcribe,
      undefined,
      getDuration,
    );
    expect(transcribe).not.toHaveBeenCalled();
    expect(wrongBytes.downloadLimited).toHaveBeenCalledTimes(1);
  });

  it("stops before any privileged storage read when the request is canceled", async () => {
    const files = storage();
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildAudioAttachmentPreviewParts(
        [ownedAttachment],
        userId,
        files,
        transcribe,
        controller.signal,
        getDuration,
      ),
    ).rejects.toBeDefined();
    expect(files.getMetadata).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("does not send unknown or over-30-second clips to synchronous transcription", async () => {
    const files = storage();
    getDuration.mockResolvedValueOnce(null).mockResolvedValueOnce(31);
    await buildAudioAttachmentPreviewParts(
      [ownedAttachment, ownedAttachment],
      userId,
      files,
      transcribe,
      undefined,
      getDuration,
    );
    expect(transcribe).not.toHaveBeenCalled();
  });
});
