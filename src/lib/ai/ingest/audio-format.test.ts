import { describe, expect, it } from "vitest";
import {
  isValidChatAudioContainer,
  normalizeChatAudioMimeType,
} from "./audio-format";

describe("chat audio MIME and container validation", () => {
  it("accepts valid signatures for each enabled attachment format", () => {
    expect(
      isValidChatAudioContainer(Buffer.from("RIFF0000WAVE"), "audio/wav"),
    ).toBe(true);
    expect(
      isValidChatAudioContainer(Buffer.from("ID3payload"), "audio/mpeg"),
    ).toBe(true);
    expect(
      isValidChatAudioContainer(Buffer.from("OggSpayload"), "audio/ogg"),
    ).toBe(true);
    expect(
      isValidChatAudioContainer(Buffer.from("0000ftypM4A"), "audio/mp4"),
    ).toBe(true);
    expect(
      isValidChatAudioContainer(
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
        "audio/webm",
      ),
    ).toBe(true);
  });

  it("rejects mismatched containers and audio formats not enabled for chat uploads", () => {
    expect(
      isValidChatAudioContainer(Buffer.from("OggSpayload"), "audio/mpeg"),
    ).toBe(false);
    for (const mime of [
      "audio/aac",
      "audio/aiff",
      "audio/flac",
      "audio/amr",
      "audio/x-ms-wma",
    ]) {
      expect(normalizeChatAudioMimeType(mime)).toBeNull();
    }
  });
});
