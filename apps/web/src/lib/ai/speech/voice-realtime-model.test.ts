import { describe, expect, it } from "vitest";

import { createVoiceRealtimeModel } from "./voice-realtime-model";

const OPTIONS = { token: "secret-token", url: "wss://provider/realtime" };

describe("createVoiceRealtimeModel", () => {
  it("connects with the gateway subprotocols on the gateway provider", () => {
    const model = createVoiceRealtimeModel(() => "gateway");

    const wsConfig = model.getWebSocketConfig(OPTIONS);

    expect(wsConfig.url).toBe("wss://provider/realtime");
    expect(wsConfig.protocols).toContain("ai-gateway-realtime.v1");
    expect(wsConfig.protocols).toContain("ai-gateway-auth.secret-token");
  });

  it("connects with the OpenAI-style subprotocol on the ElevenLabs provider", () => {
    const model = createVoiceRealtimeModel(() => "elevenlabs");

    const wsConfig = model.getWebSocketConfig(OPTIONS);

    // The subprotocol convention ElevenLabs' OpenAI-compatible endpoint
    // accepts; the minted secret is the key, never the API key itself.
    expect(wsConfig.url).toBe("wss://provider/realtime");
    expect(wsConfig.protocols).toEqual([
      "realtime",
      "openai-insecure-api-key.secret-token",
    ]);
  });

  it("passes events through untouched on the gateway provider", () => {
    const model = createVoiceRealtimeModel(() => "gateway");
    const event = { type: "session-update", config: { voice: "cedar" } };

    expect(model.serializeClientEvent(event)).toBe(event);
    const raw = { type: "session.updated", session: {} };
    expect(model.parseServerEvent(raw)).toBe(raw);
  });

  it("converts the AI SDK envelope to OpenAI GA wire on the ElevenLabs provider", () => {
    const model = createVoiceRealtimeModel(() => "elevenlabs");

    const wire = model.serializeClientEvent({
      type: "session-update",
      config: {
        voice: "brian",
        inputAudioFormat: { type: "audio/pcm", rate: 24000 },
        providerOptions: {
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "medium",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { format: { type: "audio/pcm" }, voice: "brian" },
          },
        },
      },
    }) as {
      type: string;
      session: {
        type: string;
        model: string;
        audio: {
          input: { format: { rate: number }; turn_detection: unknown };
          output: { voice: string };
        };
      };
    };

    // Dashed SDK event → dotted GA wire event with a full `session` body the
    // ElevenLabs endpoint understands, providerOptions merged in.
    expect(wire.type).toBe("session.update");
    expect(wire.session.type).toBe("realtime");
    expect(wire.session.model).toBe("eleven_realtime_v1_mini");
    expect(wire.session.audio.input.format.rate).toBe(24000);
    expect(wire.session.audio.input.turn_detection).toEqual({
      type: "semantic_vad",
      eagerness: "medium",
      create_response: true,
      interrupt_response: true,
    });
    expect(wire.session.audio.output.voice).toBe("brian");
  });

  it("parses GA wire server events on the ElevenLabs provider", () => {
    const model = createVoiceRealtimeModel(() => "elevenlabs");

    const parsed = model.parseServerEvent({
      type: "session.updated",
      session: { model: "eleven_realtime_v1_mini" },
    }) as { type?: string };

    expect(parsed).toBeDefined();
  });
});
