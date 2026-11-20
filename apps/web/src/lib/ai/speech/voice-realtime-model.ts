import { createElevenLabsRealtimeModel } from "lib/ai/speech/eleven-labs/realtime-model.client";
import { createBrowserGatewayRealtimeModel } from "lib/ai/speech/open-ai/voice-gateway-client";
import { VOICE_REALTIME_MODEL } from "lib/ai/speech/voice-realtime-config";

/**
 * A realtime "model" that routes to the gateway shim or the ElevenLabs
 * OpenAI-wire model at call time.
 *
 * Which provider a session uses is only known once the token route answers
 * (the prepare call), but `experimental_useRealtime` needs its model up front.
 * Every model method runs at or after `connect()`, and a connect cannot happen
 * before the context is prepared, so reading the provider through the getter
 * here always sees the up-to-date choice on the wire.
 */
export function createVoiceRealtimeModel(
  getProvider: () => "gateway" | "elevenlabs",
) {
  const gatewayModel = createBrowserGatewayRealtimeModel();
  const elevenLabsModel = createElevenLabsRealtimeModel();
  const current = () =>
    getProvider() === "elevenlabs" ? elevenLabsModel : gatewayModel;

  return {
    // Cosmetic on the wire: the session config carries the real model id.
    modelId: VOICE_REALTIME_MODEL,
    getWebSocketConfig: (options: { token: string; url: string }) =>
      current().getWebSocketConfig(options),
    parseServerEvent: (raw: unknown) => current().parseServerEvent(raw),
    serializeClientEvent: (event: unknown) =>
      current().serializeClientEvent(event as never),
  };
}
