import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import { isWavAudio, MAX_DEVICE_AUDIO_BYTES, transcribeDeviceWav } from "lib/voice/device-audio";

const WAV_MIME_TYPES = new Set(["audio/wav", "audio/x-wav"]);

export interface AudioChatAttachment {
  type: "file" | "source-url";
  url: string;
  mediaType?: string;
  filename?: string;
  title?: string;
}

export interface AudioAttachmentStorage {
  getMetadata(key: string): Promise<{ contentType: string; size: number } | null>;
  downloadLimited(key: string, maxBytes: number): Promise<Uint8Array>;
}

/**
 * Builds bounded, explicitly untrusted chat text from user-owned stored WAVs.
 * External URLs and inline payloads are never fetched or transcribed here.
 */
export async function buildAudioAttachmentPreviewParts(
  attachments: readonly AudioChatAttachment[],
  userId: string,
  storage: AudioAttachmentStorage,
  transcribe: (audio: Uint8Array) => Promise<string> = transcribeDeviceWav,
) {
  const audioAttachments = attachments.filter((attachment) =>
    attachment.mediaType?.toLowerCase().startsWith("audio/"),
  );
  const parts: Array<{ type: "text"; text: string; audioIngestionPreview: true }> = [];

  for (const attachment of audioAttachments) {
    const filename = safeFilename(attachment.filename ?? attachment.title ?? "audio attachment");
    const key = storageKeyFromUrl(attachment.url);
    if (!key || !isManagedStorageKey(key) || !isUserStorageKey(key, userId)) {
      parts.push(notice(filename, "not processed because this is not an owned stored upload"));
      continue;
    }

    const requestedType = attachment.mediaType?.toLowerCase().split(";", 1)[0].trim() ?? "";
    if (!WAV_MIME_TYPES.has(requestedType)) {
      parts.push(notice(filename, "not processed because only WAV transcription is supported"));
      continue;
    }

    try {
      const metadata = await storage.getMetadata(key);
      if (!metadata) {
        parts.push(notice(filename, "could not be found in private storage"));
        continue;
      }
      const storedType = metadata.contentType.toLowerCase().split(";", 1)[0].trim();
      if (!WAV_MIME_TYPES.has(storedType)) {
        parts.push(notice(filename, "not processed because its stored type is not WAV audio"));
        continue;
      }
      if (metadata.size > MAX_DEVICE_AUDIO_BYTES) {
        parts.push(notice(filename, "exceeds the 1 MB transcription limit"));
        continue;
      }

      const audio = await storage.downloadLimited(key, MAX_DEVICE_AUDIO_BYTES);
      if (audio.byteLength > MAX_DEVICE_AUDIO_BYTES) {
        parts.push(notice(filename, "exceeds the 1 MB transcription limit"));
        continue;
      }
      if (!isWavAudio(audio)) {
        parts.push(notice(filename, "not processed because its WAV data is invalid"));
        continue;
      }

      const transcript = (await transcribe(audio)).trim().slice(0, 8_000);
      if (!transcript) {
        parts.push(notice(filename, "contained no speech that could be transcribed"));
        continue;
      }
      parts.push({
        type: "text",
        text: `[Untrusted transcript from audio attachment "${filename}":\n${transcript}\nEnd of untrusted audio transcript.]`,
        audioIngestionPreview: true,
      });
    } catch {
      parts.push(notice(filename, "could not be transcribed right now"));
    }
  }

  return parts;
}

function notice(filename: string, reason: string) {
  return {
    type: "text" as const,
    text: `[Audio attachment "${filename}" ${reason}.]`,
    audioIngestionPreview: true as const,
  };
}

function safeFilename(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "audio attachment";
}
