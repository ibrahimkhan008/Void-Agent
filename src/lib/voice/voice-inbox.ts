export const VOICE_INBOX_PAGE_SIZE = 30;
export const VOICE_INBOX_MAX_TRANSCRIPT_CHARS = 8_000;

export type VoiceInboxCursor = { createdAt: string; id: string };

export function parseVoiceInboxCursor(
  value: string | null,
): VoiceInboxCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = parsed as Record<string, unknown>;
    if (
      typeof cursor.createdAt !== "string" ||
      typeof cursor.id !== "string" ||
      cursor.id.length < 1 ||
      cursor.id.length > 200
    )
      return null;
    const timestamp = new Date(cursor.createdAt);
    if (
      !Number.isFinite(timestamp.getTime()) ||
      timestamp.toISOString() !== cursor.createdAt
    )
      return null;
    return { createdAt: cursor.createdAt, id: cursor.id };
  } catch {
    return null;
  }
}

export function encodeVoiceInboxCursor(cursor: VoiceInboxCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function voiceTranscriptText(parts: unknown) {
  if (!Array.isArray(parts)) return "";
  return parts
    .flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const value = part as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string"
        ? [value.text]
        : [];
    })
    .join("\n")
    .slice(0, VOICE_INBOX_MAX_TRANSCRIPT_CHARS);
}
