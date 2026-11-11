import { z } from "zod";

const uuid = z.string().uuid();
const preciseUtcTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)));

export type VoiceDeviceSessionCursor = {
  id: string;
  startedAt: string;
};

const cursorSchema = z.object({
  id: uuid,
  startedAt: preciseUtcTimestamp,
});

export function encodeVoiceDeviceSessionCursor(
  cursor: VoiceDeviceSessionCursor,
) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeVoiceDeviceSessionCursor(
  value: string | null,
): VoiceDeviceSessionCursor | null | false {
  if (!value) return null;
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const parsed = cursorSchema.safeParse(decoded);
    return parsed.success ? parsed.data : false;
  } catch {
    return false;
  }
}
