import {
  type ChatAudioLanguageCode,
  MAX_CHAT_AUDIO_BYTES,
  MAX_SYNC_AUDIO_DURATION_SECONDS,
  isValidChatAudioContainer,
  normalizeChatAudioMimeType,
} from "./audio-format";

export async function transcribeUploadedAudio(input: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  durationSeconds: number;
  languageCode?: ChatAudioLanguageCode;
  signal?: AbortSignal;
}) {
  const mimeType = normalizeChatAudioMimeType(input.mimeType);
  if (
    !mimeType ||
    input.bytes.byteLength > MAX_CHAT_AUDIO_BYTES ||
    !isValidChatAudioContainer(input.bytes, mimeType) ||
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    input.durationSeconds > MAX_SYNC_AUDIO_DURATION_SECONDS
  ) {
    throw new Error("Audio format or size is not supported");
  }

  const baseUrl = (
    process.env.SARVAM_PROXY_URL || "https://konvo.flare-labs.tech"
  ).replace(/\/+$/, "");
  const form = new FormData();
  form.append(
    "file",
    new File([Buffer.from(input.bytes)], safeAudioFilename(input.filename), {
      type: mimeType,
    }),
  );
  form.append("model", "saaras:v3");
  form.append("language_code", input.languageCode ?? "unknown");

  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: process.env.SARVAM_PROXY_API_KEY
      ? { Authorization: `Bearer ${process.env.SARVAM_PROXY_API_KEY}` }
      : undefined,
    body: form,
    signal,
  });
  if (!response.ok) throw new Error("Audio transcription provider failed");

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null) return "";
  const value = result as Record<string, unknown>;
  const data =
    typeof value.data === "object" && value.data !== null
      ? (value.data as Record<string, unknown>)
      : {};
  return [value.transcript, value.text, data.transcript, data.text]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000);
}

function safeAudioFilename(value: string) {
  return (
    value
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 160) || "audio-attachment"
  );
}
