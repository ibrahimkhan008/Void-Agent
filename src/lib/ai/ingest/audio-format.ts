export const MAX_CHAT_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_SYNC_AUDIO_DURATION_SECONDS = 30;

/** Saaras v3 language values accepted by the transcription proxy. */
export const CHAT_AUDIO_LANGUAGE_CODES = [
  "unknown",
  "as-IN",
  "bn-IN",
  "brx-IN",
  "doi-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "kok-IN",
  "ks-IN",
  "mai-IN",
  "ml-IN",
  "mni-IN",
  "mr-IN",
  "ne-IN",
  "od-IN",
  "pa-IN",
  "sa-IN",
  "sat-IN",
  "sd-IN",
  "ta-IN",
  "te-IN",
  "ur-IN",
] as const;

export type ChatAudioLanguageCode = (typeof CHAT_AUDIO_LANGUAGE_CODES)[number];

const AUDIO_MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/mp3": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
};

export const CHAT_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
]);

export function normalizeChatAudioMimeType(value: string | undefined) {
  const base = value?.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  const normalized = AUDIO_MIME_ALIASES[base] ?? base;
  return CHAT_AUDIO_MIME_TYPES.has(normalized) ? normalized : null;
}

export function isValidChatAudioContainer(bytes: Uint8Array, mimeType: string) {
  if (bytes.byteLength < 4) return false;
  switch (normalizeChatAudioMimeType(mimeType)) {
    case "audio/wav":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
    case "audio/mpeg":
      return (
        (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      );
    case "audio/ogg":
      return ascii(bytes, 0, 4) === "OggS";
    case "audio/mp4":
      return ascii(bytes, 4, 4) === "ftyp";
    case "audio/webm":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    default:
      return false;
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
