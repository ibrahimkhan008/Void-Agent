import { describe, expect, it } from "vitest";

import { DEFAULT_VOICE_SETTINGS } from "../open-ai/voice-settings";
import {
  ELEVENLABS_REALTIME_SAMPLE_RATE,
  ELEVENLABS_REALTIME_VOICE,
  buildElevenLabsSessionConfig,
  buildElevenLabsWireSession,
} from "./realtime-session-config";

describe("buildElevenLabsSessionConfig", () => {
  it("maps the preset onto the documented ElevenLabs wire values", () => {
    const config = buildElevenLabsSessionConfig({
      voice: "jarvis",
      settings: DEFAULT_VOICE_SETTINGS,
      instructions: "Server prompt.",
    });

    // The AI SDK keys its capture/playback rate off these format fields.
    expect(config.inputAudioFormat).toEqual({
      type: "audio/pcm",
      rate: ELEVENLABS_REALTIME_SAMPLE_RATE,
    });
    expect(config.outputAudioFormat).toEqual({ type: "audio/pcm" });
    expect(config.voice).toBe(ELEVENLABS_REALTIME_VOICE);
    expect(config.turnDetection).toEqual({ type: "semantic-vad" });

    // The complete wire audio block, restated in providerOptions because the
    // OpenAI mapping replaces `audio` wholesale on merge.
    expect(config.providerOptions).toEqual({
      audio: {
        input: {
          format: { type: "audio/pcm", rate: ELEVENLABS_REALTIME_SAMPLE_RATE },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: { type: "audio/pcm" },
          voice: ELEVENLABS_REALTIME_VOICE,
        },
      },
    });

    // Preset persona and speaking style ride the server prompt.
    expect(config.instructions).toContain("Server prompt.");
    expect(config.instructions).toContain("# Speaking style");
    expect(config.instructions).toContain("JARVIS");
  });

  it("omits what ElevenLabs does not document for Realtime", () => {
    const config = buildElevenLabsSessionConfig({
      voice: "marin",
      settings: DEFAULT_VOICE_SETTINGS,
      instructions: "Server prompt.",
    });

    expect(config).not.toHaveProperty("inputAudioTranscription");
    const wireAudio = (
      config.providerOptions as { audio: Record<string, unknown> }
    ).audio;
    expect(wireAudio.input).not.toHaveProperty("noise_reduction");
    expect(wireAudio.input).not.toHaveProperty("transcription");
    expect(wireAudio.output).not.toHaveProperty("speed");
    expect(config.providerOptions).not.toHaveProperty("reasoning");
  });

  it("maps server-VAD settings onto semantic_vad, the only mode ElevenLabs documents", () => {
    const config = buildElevenLabsSessionConfig({
      voice: "cedar",
      settings: {
        ...DEFAULT_VOICE_SETTINGS,
        turnDetection: "server",
        threshold: 0.9,
        silenceDurationMs: 700,
      },
    });

    const wireAudio = (
      config.providerOptions as {
        audio: { input: { turn_detection: Record<string, unknown> } };
      }
    ).audio;
    expect(wireAudio.input.turn_detection.type).toBe("semantic_vad");
    expect(wireAudio.input.turn_detection).not.toHaveProperty("threshold");
    expect(wireAudio.input.turn_detection).not.toHaveProperty(
      "silence_duration_ms",
    );
  });

  it("maps the OpenAI-only 'auto' eagerness to the closest documented value", () => {
    const config = buildElevenLabsSessionConfig({
      voice: "cedar",
      settings: { ...DEFAULT_VOICE_SETTINGS, eagerness: "auto" },
    });

    const wireAudio = (
      config.providerOptions as {
        audio: { input: { turn_detection: { eagerness: string } } };
      }
    ).audio;
    expect(wireAudio.input.turn_detection.eagerness).toBe("medium");
  });

  it("disables turn detection entirely for push-to-talk sessions", () => {
    const config = buildElevenLabsSessionConfig({
      voice: "cedar",
      settings: DEFAULT_VOICE_SETTINGS,
      ptt: true,
    });

    expect(config.turnDetection).toEqual({ type: "disabled" });
    const wireAudio = (
      config.providerOptions as {
        audio: { input: { turn_detection: unknown } };
      }
    ).audio;
    expect(wireAudio.input.turn_detection).toBeNull();
  });

  it("passes the tool list through and omits absent instructions", () => {
    const tools = [
      {
        type: "function" as const,
        name: "endConversation",
        parameters: { type: "object", properties: {} },
      },
    ];
    const config = buildElevenLabsSessionConfig({
      voice: "cedar",
      settings: DEFAULT_VOICE_SETTINGS,
      tools,
    });

    expect(config.tools).toBe(tools);
    expect(config).not.toHaveProperty("instructions");
  });
});

describe("buildElevenLabsWireSession (live settings update)", () => {
  it("carries only the turn detection — omitted fields keep their value", () => {
    const wire = buildElevenLabsWireSession({
      settings: DEFAULT_VOICE_SETTINGS,
      ptt: false,
    });

    expect(wire).toEqual({
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true,
          },
        },
      },
    });
    expect(wire.audio.output).toBeUndefined();
  });
});
