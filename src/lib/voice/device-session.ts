import { z } from "zod";

export const deviceVoiceSessionStartSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120),
  })
  .strict();

export const deviceVoiceSegmentSchema = z
  .object({
    eventId: z.string().trim().min(1).max(200),
    sequenceNumber: z.number().int().min(0).max(499),
    text: z.string().trim().min(1).max(8_000),
    language: z.string().trim().min(2).max(32).optional(),
  })
  .strict();

export const MAX_DEVICE_VOICE_SEGMENTS = 500;
export const MAX_DEVICE_VOICE_TRANSCRIPT_CHARS = 24_000;

export function assembleDeviceVoiceTranscript(
  segments: Array<{ text: string }>,
) {
  const transcript = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");
  if (transcript.length <= MAX_DEVICE_VOICE_TRANSCRIPT_CHARS) return transcript;
  return `${transcript.slice(0, MAX_DEVICE_VOICE_TRANSCRIPT_CHARS - 1)}…`;
}
