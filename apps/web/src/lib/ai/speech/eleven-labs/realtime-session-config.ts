import {
  type OpenAIVoicePreset,
  VOICE_STYLE_INSTRUCTIONS,
  resolveOpenAIVoicePreset,
} from "lib/ai/speech/open-ai/voice-constants";
import {
  type VoiceSettings,
  normalizeVoiceSettings,
} from "lib/ai/speech/open-ai/voice-settings";
import type { OpenAIRealtimeFunctionTool } from "lib/voice/openai-tools";

/**
 * ElevenLabs Realtime: the OpenAI-GA-wire-compatible voice conversation API
 * (`wss://api.elevenlabs.io/v1/convai/realtime`). The same client/server
 * events as OpenAI's GA Realtime API, so the voice hook keeps its AI SDK
 * realtime client; only the credentials, the URL, the model and the session
 * configuration differ (see the ElevenLabs `realtime` skill, "Migrate an app
 * from OpenAI Realtime").
 */

/** Mini first, per the skill: lowest latency and cost; Max only for reasoning-heavy work. */
export const ELEVENLABS_REALTIME_MODEL = "eleven_realtime_v1_mini";

/** Where the browser opens the realtime WebSocket. Comes from the token route. */
export const ELEVENLABS_REALTIME_WS_URL =
  "wss://api.elevenlabs.io/v1/convai/realtime";

/**
 * Only satisfies the OpenAI realtime model's config shape — the browser flow
 * takes the URL from the token route and never mints through the model.
 */
export const ELEVENLABS_REALTIME_API_BASE_URL = "https://api.elevenlabs.io/v1";

/**
 * The voice an ElevenLabs Realtime session speaks with. `brian` is the value
 * ElevenLabs documents; the full accepted set is not published yet, so every
 * drawer preset maps here and the preset's persona and instructions still
 * apply on top.
 */
export const ELEVENLABS_REALTIME_VOICE = "brian";

/** PCM16 mono at 24 kHz — the only audio format ElevenLabs documents, and the AI SDK's own capture default. */
export const ELEVENLABS_REALTIME_SAMPLE_RATE = 24_000;

export type ElevenLabsRealtimeSessionConfigInput = {
  /** Preset id from the drawer; only its persona/language is used here. */
  voice: string;
  /** Raw store value; validated before anything is sent. */
  settings?: unknown;
  instructions?: string;
  tools?: OpenAIRealtimeFunctionTool[];
  /** Push-to-talk: no turn detection; the caller commits each turn itself. */
  ptt?: boolean;
};

/**
 * The wire `audio.input.turn_detection`. ElevenLabs documents `semantic_vad`
 * only, so the drawer's server-VAD knobs (threshold, silence, padding) have
 * no equivalent and are not sent. `auto` eagerness is an OpenAI value — the
 * closest documented ElevenLabs behavior is `medium`.
 */
function buildElevenLabsWireTurnDetection(
  settings: VoiceSettings,
  ptt: boolean,
) {
  if (ptt) return null;
  return {
    type: "semantic_vad",
    eagerness: settings.eagerness === "auto" ? "medium" : settings.eagerness,
    create_response: true,
    interrupt_response: settings.allowInterruptions,
  };
}

/**
 * The GA wire block merged into the session via `providerOptions`. Compared
 * to the OpenAI wire session (`buildVoiceWireSession`) this deliberately
 * omits `noise_reduction`, output `speed`, `reasoning` and input
 * `transcription` — ElevenLabs documents none of them for Realtime, and a
 * rejected `session.update` leaves the session on its defaults (no
 * instructions, no tools).
 *
 * With a `preset` (connect time) the block is complete, formats included. A
 * live settings update omits the static fields: only the turn detection can
 * change mid-session, and fields left out of an update keep their current
 * value.
 */
export function buildElevenLabsWireSession(input: {
  preset?: OpenAIVoicePreset;
  settings: VoiceSettings;
  ptt: boolean;
}) {
  const { preset, settings, ptt } = input;
  return {
    audio: {
      input: {
        ...(preset
          ? {
              format: {
                type: "audio/pcm",
                rate: ELEVENLABS_REALTIME_SAMPLE_RATE,
              },
            }
          : {}),
        turn_detection: buildElevenLabsWireTurnDetection(settings, ptt),
      },
      ...(preset
        ? {
            output: {
              format: { type: "audio/pcm" },
              // No voice on a live update: same conservatism as the OpenAI
              // path — a voice change once the model has spoken is refused.
              voice: ELEVENLABS_REALTIME_VOICE,
            },
          }
        : {}),
    },
  };
}

/**
 * The realtime session config the voice hook sends in its `session-update`
 * when the token route picked ElevenLabs. Same two-layer shape as the OpenAI
 * builder (`buildRealtimeSessionConfig`): the AI SDK's normalized fields the
 * OpenAI realtime mapping converts to GA wire, plus the full wire audio block
 * restated in `providerOptions` (the mapping's `Object.assign` replaces
 * `audio` wholesale, so the block must be complete on connect).
 */
export function buildElevenLabsSessionConfig(
  input: ElevenLabsRealtimeSessionConfigInput,
) {
  const preset = resolveOpenAIVoicePreset(input.voice);
  const settings = normalizeVoiceSettings(input.settings);
  const ptt = input.ptt === true;
  // The style sections ride on the server prompt. Without one (nothing
  // prepared yet) the key stays absent, as before.
  const instructions = input.instructions
    ? [input.instructions, VOICE_STYLE_INSTRUCTIONS, preset.persona]
        .filter(Boolean)
        .join("\n\n")
    : undefined;
  const wire = buildElevenLabsWireSession({ preset, settings, ptt });

  return {
    // The AI SDK keys its capture/playback sample rate off these format
    // fields; 24 kHz PCM is the only rate ElevenLabs documents.
    inputAudioFormat: {
      type: "audio/pcm",
      rate: ELEVENLABS_REALTIME_SAMPLE_RATE,
    },
    outputAudioFormat: { type: "audio/pcm" },
    voice: ELEVENLABS_REALTIME_VOICE,
    // Eagerness rides the providerOptions wire block — the SDK's
    // session-config type has no field for it (same gap as the OpenAI path).
    turnDetection: ptt
      ? ({ type: "disabled" } as const)
      : ({ type: "semantic-vad" } as const),
    providerOptions: wire,
    ...(instructions ? { instructions } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
  };
}
