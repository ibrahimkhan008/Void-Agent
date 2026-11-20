import "server-only";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { OpenAIRealtimeFunctionTool } from "lib/voice/openai-tools";
import {
  ELEVENLABS_REALTIME_MODEL,
  ELEVENLABS_REALTIME_SAMPLE_RATE,
  ELEVENLABS_REALTIME_VOICE,
  ELEVENLABS_REALTIME_WS_URL,
} from "./realtime-session-config";

/**
 * Mint a single-use ElevenLabs Realtime client secret for the browser.
 *
 * The browser never sees ELEVENLABS_API_KEY: it gets the short-lived `value`
 * (15-minute expiry, consumed on connect) plus the WebSocket URL, and passes
 * the value as the OpenAI-style `openai-insecure-api-key` subprotocol. Same
 * contract as the AI Gateway mint it replaces.
 *
 * The mint body is the authoritative initial session for the credential —
 * model, instructions and tools must match what the browser's own
 * `session.update` re-sends after connecting (it carries the live voice
 * settings on top). Audio is PCM16 mono at 24 kHz, the only format
 * ElevenLabs documents, matching the AI SDK's capture default.
 */
export async function mintElevenLabsRealtimeSecret(input: {
  instructions?: string;
  tools?: OpenAIRealtimeFunctionTool[];
}): Promise<{ token: string; url: string }> {
  const elevenlabs = new ElevenLabsClient();

  const secret = await elevenlabs.conversationalAi.realtime.createClientSecret({
    session: {
      type: "realtime",
      model: ELEVENLABS_REALTIME_MODEL,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      outputModalities: ["audio"],
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: ELEVENLABS_REALTIME_SAMPLE_RATE,
          },
          turnDetection: { type: "semantic_vad", eagerness: "medium" },
        },
        output: {
          format: { type: "audio/pcm" },
          voice: ELEVENLABS_REALTIME_VOICE,
        },
      },
      ...(input.tools && input.tools.length > 0
        ? {
            tools: input.tools.map((tool) => ({
              type: "function" as const,
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              parameters: tool.parameters,
            })),
          }
        : {}),
    },
    expiresAfter: { anchor: "created_at", seconds: 600 },
  });

  return { token: secret.value, url: ELEVENLABS_REALTIME_WS_URL };
}
