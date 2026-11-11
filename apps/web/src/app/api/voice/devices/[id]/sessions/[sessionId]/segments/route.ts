import { getSession } from "auth/server";
import { voiceDeviceCustomRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const uuidSchema = z.string().uuid();
const sessionIdSchema = z.string().trim().min(1).max(120);
const noStore = { "Cache-Control": "no-store" };
const MAX_SEGMENT_TEXT = 24_000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const { id: deviceId, sessionId } = await context.params;
  if (
    !uuidSchema.safeParse(deviceId).success ||
    !sessionIdSchema.safeParse(sessionId).success
  )
    return new Response("Not found", { status: 404, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-device-session-segments-read",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  try {
    const segments =
      await voiceDeviceCustomRepository.listTranscriptSegmentsByDeviceSession({
        deviceId,
        userId: session.user.id,
        sessionId,
      });
    if (!segments)
      return new Response("Voice session not found", {
        status: 404,
        headers: noStore,
      });
    let remaining = MAX_SEGMENT_TEXT;
    let truncated = false;
    const items: Array<{
      eventId: string;
      sequenceNumber: number;
      text: string;
      language: string | null;
      createdAt: string;
    }> = [];
    for (const segment of segments) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const text = segment.text.slice(0, remaining);
      if (text.length < segment.text.length) truncated = true;
      remaining -= text.length;
      items.push({
        eventId: segment.eventId,
        sequenceNumber: segment.sequenceNumber,
        text,
        language: segment.language,
        createdAt: segment.createdAt.toISOString(),
      });
    }
    return Response.json({ items, truncated }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Could not load voice session segments" },
      { status: 500, headers: noStore },
    );
  }
}
