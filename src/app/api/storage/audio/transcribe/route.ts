import { getSession } from "auth/server";
import {
  CHAT_AUDIO_LANGUAGE_CODES,
  MAX_CHAT_AUDIO_BYTES,
  MAX_SYNC_AUDIO_DURATION_SECONDS,
  isValidChatAudioContainer,
  normalizeChatAudioMimeType,
} from "lib/ai/ingest/audio-format";
import { getChatAudioDurationSeconds } from "lib/ai/ingest/audio-metadata";
import { transcribeUploadedAudio } from "lib/ai/ingest/uploaded-audio";
import { serverFileStorage } from "lib/file-storage";
import { isUserStorageKey } from "lib/file-storage/storage-utils";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

const requestSchema = z
  .object({
    key: z.string().trim().min(1).max(1_024),
    languageCode: z.enum(CHAT_AUDIO_LANGUAGE_CODES).optional(),
  })
  .strict();
const noStore = { "Cache-Control": "private, no-store" };
/** Transcribes an owned stored audio upload for an ephemeral preview only. */
export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "storage-audio-transcription",
    id: userId,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many transcription requests", {
      status: 429,
      headers: noStore,
    });

  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "A stored audio key is required" },
      { status: 400, headers: noStore },
    );
  const { key } = parsed.data;
  if (key.includes("..") || !isUserStorageKey(key, userId))
    return new Response("File not found", { status: 404, headers: noStore });

  try {
    const metadata = await serverFileStorage.getMetadata(key);
    if (request.signal.aborted)
      return new Response(null, { status: 499, headers: noStore });
    if (!metadata)
      return new Response("File not found", { status: 404, headers: noStore });
    const mimeType = normalizeChatAudioMimeType(metadata.contentType);
    if (!mimeType) {
      return Response.json(
        { error: "This audio format cannot be transcribed" },
        { status: 415, headers: noStore },
      );
    }
    if (metadata.size > MAX_CHAT_AUDIO_BYTES)
      return Response.json(
        { error: "Audio exceeds the 15 MB transcription limit" },
        { status: 413, headers: noStore },
      );

    const audio = await serverFileStorage.downloadLimited(
      key,
      MAX_CHAT_AUDIO_BYTES,
    );
    if (request.signal.aborted)
      return new Response(null, { status: 499, headers: noStore });
    if (audio.byteLength > MAX_CHAT_AUDIO_BYTES)
      return Response.json(
        { error: "Audio exceeds the 15 MB transcription limit" },
        { status: 413, headers: noStore },
      );
    if (!isValidChatAudioContainer(audio, mimeType))
      return Response.json(
        { error: "Stored audio data does not match its content type" },
        { status: 415, headers: noStore },
      );

    const duration = await getChatAudioDurationSeconds(audio, mimeType);
    if (request.signal.aborted)
      return new Response(null, { status: 499, headers: noStore });
    if (duration === null)
      return Response.json(
        {
          error:
            "Audio duration could not be verified, so it was not transcribed",
        },
        { status: 422, headers: noStore },
      );
    if (duration > MAX_SYNC_AUDIO_DURATION_SECONDS)
      return Response.json(
        { error: "Audio exceeds the 30 second transcription limit" },
        { status: 413, headers: noStore },
      );

    const filename = key.split("/").at(-1) ?? "audio-attachment";
    const transcript = await transcribeUploadedAudio({
      bytes: audio,
      mimeType,
      filename,
      durationSeconds: duration,
      languageCode: parsed.data.languageCode ?? "unknown",
      signal: request.signal,
    });
    if (!transcript)
      return Response.json(
        { error: "No speech detected in this recording" },
        { status: 422, headers: noStore },
      );
    return Response.json({ transcript }, { headers: noStore });
  } catch {
    if (request.signal.aborted)
      return new Response(null, { status: 499, headers: noStore });
    return Response.json(
      { error: "Audio transcription is temporarily unavailable" },
      { status: 502, headers: noStore },
    );
  }
}
