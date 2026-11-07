import { getSession } from "auth/server";
import { serverFileStorage } from "lib/file-storage";
import { isUserStorageKey } from "lib/file-storage/storage-utils";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { isWavAudio, MAX_DEVICE_AUDIO_BYTES, transcribeDeviceWav } from "lib/voice/device-audio";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

const requestSchema = z.object({ key: z.string().trim().min(1).max(1_024) }).strict();
const noStore = { "Cache-Control": "private, no-store" };
const supportedTypes = new Set(["audio/wav", "audio/x-wav"]);

/** Transcribes an owned stored WAV for an ephemeral preview only. */
export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId) return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({ kind: "storage-audio-transcription", id: userId, limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many transcription requests", { status: 429, headers: noStore });

  const body = await readBoundedJson(request, 2_048);
  if (!body.ok) return Response.json({ error: body.tooLarge ? "Request body too large" : "Invalid JSON" }, { status: body.tooLarge ? 413 : 400, headers: noStore });
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "A stored audio key is required" }, { status: 400, headers: noStore });
  const { key } = parsed.data;
  if (key.includes("..") || !isUserStorageKey(key, userId)) return new Response("File not found", { status: 404, headers: noStore });

  try {
    const metadata = await serverFileStorage.getMetadata(key);
    if (!metadata) return new Response("File not found", { status: 404, headers: noStore });
    if (!supportedTypes.has(metadata.contentType.toLowerCase().split(";", 1)[0].trim())) {
      return Response.json({ error: "Only WAV audio can be transcribed" }, { status: 415, headers: noStore });
    }
    if (metadata.size > MAX_DEVICE_AUDIO_BYTES) return Response.json({ error: "Audio exceeds the 1 MB transcription limit" }, { status: 413, headers: noStore });

    const audio = await serverFileStorage.downloadLimited(key, MAX_DEVICE_AUDIO_BYTES);
    if (audio.byteLength > MAX_DEVICE_AUDIO_BYTES) return Response.json({ error: "Audio exceeds the 1 MB transcription limit" }, { status: 413, headers: noStore });
    if (!isWavAudio(audio)) return Response.json({ error: "Stored file is not a valid WAV recording" }, { status: 415, headers: noStore });

    const transcript = await transcribeDeviceWav(audio);
    if (!transcript) return Response.json({ error: "No speech detected in this recording" }, { status: 422, headers: noStore });
    return Response.json({ transcript }, { headers: noStore });
  } catch {
    return Response.json({ error: "Audio transcription is temporarily unavailable" }, { status: 502, headers: noStore });
  }
}
