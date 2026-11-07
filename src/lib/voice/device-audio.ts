import { z } from "zod";

export const MAX_DEVICE_AUDIO_BYTES = 1_000_000;
export const isWavAudio = (bytes: Uint8Array) =>
  bytes.byteLength >= 12 &&
  String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE";

export const deviceAudioHeadersSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(200),
  language: z.string().trim().min(2).max(32).optional(),
}).strict();

export async function readBoundedWav(request: Request, maxBytes = MAX_DEVICE_AUDIO_BYTES) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (size < 12) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!isWavAudio(bytes)) return null;
  return bytes;
}

export async function transcribeDeviceWav(bytes: Uint8Array) {
  const baseUrl = (process.env.SARVAM_PROXY_URL || "https://konvo.flare-labs.tech").replace(/\/+$/, "");
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], "voice-device.wav", { type: "audio/wav" }));
  form.append("model", "saaras:v3");
  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: process.env.SARVAM_PROXY_API_KEY ? { Authorization: `Bearer ${process.env.SARVAM_PROXY_API_KEY}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Speech transcription service rejected the audio");
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null) return "";
  const value = result as Record<string, unknown>;
  const data = typeof value.data === "object" && value.data !== null ? value.data as Record<string, unknown> : {};
  const text = [value.transcript, value.text, data.transcript, data.text].filter((item): item is string => typeof item === "string").join(" ").replace(/\s+/g, " ").trim();
  return text.slice(0, 8_000);
}
