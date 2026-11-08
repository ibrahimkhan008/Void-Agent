import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS,
  normalizeOpenAIRealtimeVoiceSettings,
  toOpenAIRealtimeCreateSettings,
} from "./openai-realtime-settings";

describe("OpenAI Realtime voice settings", () => {
  it("uses safe defaults for missing or invalid persisted values", () => {
    expect(normalizeOpenAIRealtimeVoiceSettings(null)).toEqual(
      DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS,
    );
    expect(
      normalizeOpenAIRealtimeVoiceSettings({
        threshold: Number.NaN,
        silenceDurationMs: "fast",
        prefixPaddingMs: Infinity,
        noiseReduction: "unexpected",
      }),
    ).toEqual(DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS);
  });

  it("clamps numeric VAD values and only accepts known noise settings", () => {
    expect(
      normalizeOpenAIRealtimeVoiceSettings({
        threshold: 8,
        silenceDurationMs: 9_999,
        prefixPaddingMs: -40,
        noiseReduction: "far_field",
      }),
    ).toEqual({
      threshold: 1,
      silenceDurationMs: 3000,
      prefixPaddingMs: 0,
      noiseReduction: "far_field",
    });
  });

  it("converts normalized preferences to supported Realtime session fields", () => {
    expect(
      toOpenAIRealtimeCreateSettings({
        threshold: 0.7,
        silenceDurationMs: 700,
        prefixPaddingMs: 500,
        noiseReduction: "off",
        ignored: "must not be forwarded",
      }),
    ).toEqual({
      input_audio_noise_reduction: null,
      turn_detection: {
        type: "server_vad",
        threshold: 0.7,
        silence_duration_ms: 700,
        prefix_padding_ms: 500,
        create_response: true,
        interrupt_response: true,
      },
    });
  });
});
