"use client";

import type { VoiceSessionThreadRequest } from "./session-thread-contract";

export async function flushVoiceSessionTurns(request: VoiceSessionThreadRequest) {
  try {
    const body = JSON.stringify(request);
    const response = await fetch("/api/voice/session-thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Browser keepalive requests are size-limited; use it only for small
      // final flushes and let larger turn batches use a normal fetch.
      keepalive: body.length < 60_000,
    });
    return response.ok;
  } catch {
    return false;
  }
}
