import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import {
  MAX_CHAT_AUDIO_BYTES,
  MAX_SYNC_AUDIO_DURATION_SECONDS,
  isValidChatAudioContainer,
  normalizeChatAudioMimeType,
} from "./audio-format";
import { getChatAudioDurationSeconds } from "./audio-metadata";
import { transcribeUploadedAudio } from "./uploaded-audio";

export interface AudioChatAttachment {
  type: "file" | "source-url";
  url: string;
  mediaType?: string;
  filename?: string;
  title?: string;
}

export interface AudioAttachmentStorage {
  getMetadata(
    key: string,
  ): Promise<{ contentType: string; size: number } | null>;
  downloadLimited(key: string, maxBytes: number): Promise<Uint8Array>;
}

type TranscribeAudio = (input: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  durationSeconds: number;
  signal?: AbortSignal;
}) => Promise<string>;
type GetAudioDuration = (
  audio: Uint8Array,
  mimeType: string,
) => Promise<number | null>;

/**
 * Builds bounded, explicitly untrusted chat text from user-owned stored audio.
 * External URLs and inline payloads are never fetched or transcribed here.
 */
export async function buildAudioAttachmentPreviewParts(
  attachments: readonly AudioChatAttachment[],
  userId: string,
  storage: AudioAttachmentStorage,
  transcribe: TranscribeAudio = transcribeUploadedAudio,
  signal?: AbortSignal,
  getDuration: GetAudioDuration = getChatAudioDurationSeconds,
) {
  const audioAttachments = attachments.filter((attachment) =>
    attachment.mediaType?.toLowerCase().startsWith("audio/"),
  );
  const parts: Array<{
    type: "text";
    text: string;
    audioIngestionPreview: true;
  }> = [];

  for (const attachment of audioAttachments) {
    throwIfAborted(signal);
    const filename = safeFilename(
      attachment.filename ?? attachment.title ?? "audio attachment",
    );
    const key = storageKeyFromUrl(attachment.url);
    if (!key || !isManagedStorageKey(key) || !isUserStorageKey(key, userId)) {
      parts.push(
        notice(
          filename,
          "not processed because this is not an owned stored upload",
        ),
      );
      continue;
    }

    const requestedType = normalizeChatAudioMimeType(attachment.mediaType);
    if (!requestedType) {
      parts.push(
        notice(
          filename,
          "not processed because its audio format is not supported",
        ),
      );
      continue;
    }

    try {
      const metadata = await storage.getMetadata(key);
      throwIfAborted(signal);
      if (!metadata) {
        parts.push(notice(filename, "could not be found in private storage"));
        continue;
      }
      const storedType = normalizeChatAudioMimeType(metadata.contentType);
      if (!storedType || storedType !== requestedType) {
        parts.push(
          notice(
            filename,
            "not processed because its stored type does not match the attachment",
          ),
        );
        continue;
      }
      if (metadata.size > MAX_CHAT_AUDIO_BYTES) {
        parts.push(notice(filename, "exceeds the 15 MB transcription limit"));
        continue;
      }

      const audio = await storage.downloadLimited(key, MAX_CHAT_AUDIO_BYTES);
      throwIfAborted(signal);
      if (audio.byteLength > MAX_CHAT_AUDIO_BYTES) {
        parts.push(notice(filename, "exceeds the 15 MB transcription limit"));
        continue;
      }
      if (!isValidChatAudioContainer(audio, storedType)) {
        parts.push(
          notice(filename, "not processed because its audio data is invalid"),
        );
        continue;
      }

      const duration = await getDuration(audio, storedType);
      throwIfAborted(signal);
      if (duration === null) {
        parts.push(
          notice(
            filename,
            "not transcribed because its duration could not be verified",
          ),
        );
        continue;
      }
      if (duration > MAX_SYNC_AUDIO_DURATION_SECONDS) {
        parts.push(
          notice(filename, "is longer than the 30 second transcription limit"),
        );
        continue;
      }

      const transcript = (
        await transcribe({
          bytes: audio,
          mimeType: storedType,
          filename,
          durationSeconds: duration,
          signal,
        })
      )
        .trim()
        .slice(0, 8_000);
      if (!transcript) {
        parts.push(
          notice(filename, "contained no speech that could be transcribed"),
        );
        continue;
      }
      parts.push({
        type: "text",
        text: `[Untrusted transcript from audio attachment "${filename}":\n${transcript}\nEnd of untrusted audio transcript.]`,
        audioIngestionPreview: true,
      });
    } catch {
      if (signal?.aborted)
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
      parts.push(notice(filename, "could not be transcribed right now"));
    }
  }

  return parts;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
}

function notice(filename: string, reason: string) {
  return {
    type: "text" as const,
    text: `[Audio attachment "${filename}" ${reason}.]`,
    audioIngestionPreview: true as const,
  };
}

function safeFilename(value: string) {
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "audio attachment"
  );
}
