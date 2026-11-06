import { describe, expect, it } from "vitest";
import {
  buildAssemblyAIStreamingUrl,
  float32ToPcm16,
  readFinalAssemblyAITranscript,
  resampleFloat32,
} from "./assemblyai-stream";

describe("AssemblyAI dictation contracts", () => {
  it("builds a fixed secure streaming URL with an encoded ephemeral token", () => {
    const url = new URL(buildAssemblyAIStreamingUrl("temporary token"));
    expect(url.protocol).toBe("wss:");
    expect(url.hostname).toBe("streaming.eu.assemblyai.com");
    expect(url.searchParams.get("token")).toBe("temporary token");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
    expect(url.searchParams.get("encoding")).toBe("pcm_s16le");
  });

  it("converts and resamples bounded PCM buffers", () => {
    const pcm = float32ToPcm16(new Float32Array([-1, 0, 1]));
    expect(Array.from(new Int16Array(pcm))).toEqual([-32768, 0, 32767]);
    expect(
      Array.from(
        resampleFloat32(new Float32Array([0, 0.5, 1, 0.5]), 32_000, 16_000),
      ),
    ).toEqual([0.25, 0.75]);
  });

  it("accepts only finalized bounded transcript turns", () => {
    expect(
      readFinalAssemblyAITranscript(
        JSON.stringify({
          type: "Turn",
          end_of_turn: true,
          transcript: "Hello",
          turn_order: 2,
        }),
      ),
    ).toEqual({ text: "Hello", turnOrder: 2 });
    expect(
      readFinalAssemblyAITranscript(
        JSON.stringify({
          type: "Turn",
          end_of_turn: false,
          transcript: "partial",
        }),
      ),
    ).toBeNull();
    expect(readFinalAssemblyAITranscript("not json")).toBeNull();
  });
});
