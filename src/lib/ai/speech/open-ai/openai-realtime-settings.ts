export type OpenAIRealtimeVoiceSettings = {
  threshold: number;
  silenceDurationMs: number;
  prefixPaddingMs: number;
  noiseReduction: "near_field" | "far_field" | "off";
};

export const DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS: OpenAIRealtimeVoiceSettings =
  {
    threshold: 0.5,
    silenceDurationMs: 500,
    prefixPaddingMs: 300,
    noiseReduction: "near_field",
  };

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

/** Normalize persisted/client supplied settings before they reach OpenAI. */
export function normalizeOpenAIRealtimeVoiceSettings(
  raw: unknown,
): OpenAIRealtimeVoiceSettings {
  const value =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const noiseReduction = value.noiseReduction;
  return {
    threshold: boundedNumber(
      value.threshold,
      DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS.threshold,
      0,
      1,
    ),
    silenceDurationMs: Math.round(
      boundedNumber(
        value.silenceDurationMs,
        DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS.silenceDurationMs,
        100,
        3000,
      ),
    ),
    prefixPaddingMs: Math.round(
      boundedNumber(
        value.prefixPaddingMs,
        DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS.prefixPaddingMs,
        0,
        2000,
      ),
    ),
    noiseReduction:
      noiseReduction === "far_field" || noiseReduction === "off"
        ? noiseReduction
        : DEFAULT_OPENAI_REALTIME_VOICE_SETTINGS.noiseReduction,
  };
}

export function toOpenAIRealtimeCreateSettings(raw: unknown) {
  const settings = normalizeOpenAIRealtimeVoiceSettings(raw);
  return {
    input_audio_noise_reduction:
      settings.noiseReduction === "off"
        ? null
        : { type: settings.noiseReduction },
    turn_detection: {
      type: "server_vad",
      threshold: settings.threshold,
      silence_duration_ms: settings.silenceDurationMs,
      prefix_padding_ms: settings.prefixPaddingMs,
      create_response: true,
      interrupt_response: true,
    },
  };
}
