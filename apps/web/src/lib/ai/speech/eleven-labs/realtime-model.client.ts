import { Experimental_OpenAIRealtimeModel } from "@ai-sdk/openai";
import {
  ELEVENLABS_REALTIME_API_BASE_URL,
  ELEVENLABS_REALTIME_MODEL,
} from "./realtime-session-config";

/**
 * Browser-safe ElevenLabs Realtime model for the AI SDK realtime client.
 *
 * ElevenLabs Realtime speaks OpenAI's GA wire protocol, so the OpenAI
 * provider's realtime model does the event and session serialization: it
 * converts the AI SDK's session config (including the `providerOptions` wire
 * block) into GA `session.update` bodies, and the dashed client events into
 * dotted wire events. The URL and the minted single-use client secret arrive
 * from our token route — `getWebSocketConfig` is called with the route's
 * `{ token, url }` and passes both on, adding the OpenAI-style
 * `openai-insecure-api-key.<secret>` subprotocol that ElevenLabs accepts.
 *
 * The `baseURL` below only satisfies the model's config shape; the browser
 * flow never mints through the model itself, and no API key is embedded — the
 * secret is minted server-side and reaches the browser per session.
 */
export function createElevenLabsRealtimeModel() {
  return new Experimental_OpenAIRealtimeModel(ELEVENLABS_REALTIME_MODEL, {
    provider: "elevenlabs",
    baseURL: ELEVENLABS_REALTIME_API_BASE_URL,
    headers: () => ({}),
  });
}
