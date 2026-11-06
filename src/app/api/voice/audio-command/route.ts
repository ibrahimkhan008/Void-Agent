import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { deviceAudioHeadersSchema, readBoundedWav, transcribeDeviceWav } from "lib/voice/device-audio";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { persistVoiceDeviceTranscript } from "lib/voice/device-transcript-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Transcribes an enrolled device's raw WAV payload and saves it for review; no action is auto-executed. */
export async function POST(request: Request) {
  const device = await authenticateVoiceDevice(request);
  if (!device) return new Response("Unauthorized", { status: 401 });
  const rate = await checkApiRateLimit({ kind: "voice-device-audio", id: device.id, limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many voice requests", { status: 429 });

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "audio/wav" && contentType !== "audio/x-wav") return new Response("Expected raw WAV audio", { status: 415 });
  const metadata = deviceAudioHeadersSchema.safeParse({
    sessionId: request.headers.get("x-voice-session-id"),
    eventId: request.headers.get("x-voice-event-id"),
    ...(request.headers.has("x-voice-language") ? { language: request.headers.get("x-voice-language") } : {}),
  });
  if (!metadata.success) return new Response("Invalid voice event metadata", { status: 400 });
  const audio = await readBoundedWav(request);
  if (!audio) return new Response("Invalid or oversized WAV audio", { status: 413 });

  try {
    const text = await transcribeDeviceWav(audio);
    if (!text) return Response.json({ error: "No speech detected" }, { status: 422 });
    const stored = await persistVoiceDeviceTranscript(device, { ...metadata.data, text });
    if (stored.forbidden) return new Response("Forbidden", { status: 403 });
    return Response.json({ ok: true, transcript: text, threadId: stored.threadId, messageId: stored.messageId, action: "saved_for_review" });
  } catch {
    return Response.json({ error: "Could not process voice audio" }, { status: 502 });
  }
}
