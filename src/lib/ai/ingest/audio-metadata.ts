import { parseBuffer } from "music-metadata";

/**
 * Sarvam's synchronous transcription endpoint accepts only clips up to 30s.
 * A missing/invalid duration is deliberately treated as unsupported rather
 * than sending an unbounded recording to the synchronous endpoint.
 */
export async function getChatAudioDurationSeconds(
  bytes: Uint8Array,
  mimeType: string,
): Promise<number | null> {
  try {
    const metadata = await parseBuffer(Buffer.from(bytes), mimeType, {
      duration: true,
      skipCovers: true,
    });
    const duration = metadata.format.duration;
    return typeof duration === "number" &&
      Number.isFinite(duration) &&
      duration > 0
      ? duration
      : null;
  } catch {
    return null;
  }
}
