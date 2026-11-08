import { getSession } from "auth/server";
import { voiceDeviceRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import {
  decodeVoiceDeviceSessionCursor,
  encodeVoiceDeviceSessionCursor,
} from "lib/voice/device-session-cursor";
import { voiceDeviceUuid } from "lib/voice/device-transcript";
import { z } from "zod";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const noStore = { "cache-control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success)
    return new Response("Not found", { status: 404, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-device-sessions",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });
  const parsedLimit = limitSchema.safeParse(
    new URL(request.url).searchParams.get("limit") ?? undefined,
  );
  if (!parsedLimit.success)
    return Response.json(
      { error: "Invalid session limit" },
      { status: 400, headers: noStore },
    );
  const cursor = decodeVoiceDeviceSessionCursor(
    new URL(request.url).searchParams.get("cursor"),
  );
  if (cursor === false)
    return Response.json(
      { error: "Invalid session cursor" },
      { status: 400, headers: noStore },
    );

  try {
    const sessions = await voiceDeviceRepository.listRecentSessionsByDevice({
      deviceId: id,
      userId: session.user.id,
      limit: parsedLimit.data + 1,
      cursor: cursor ?? undefined,
    });
    const hasMore = sessions.length > parsedLimit.data;
    const page = hasMore ? sessions.slice(0, parsedLimit.data) : sessions;
    const last = page.at(-1);
    return Response.json(
      {
        items: page.map((item) => ({
          id: item.id,
          sessionId: item.sessionId,
          status: item.status,
          segmentCount: item.segmentCount,
          startedAt: item.startedAt.toISOString(),
          lastSegmentAt: item.lastSegmentAt?.toISOString() ?? null,
          finalizedAt: item.finalizedAt?.toISOString() ?? null,
          transcript: item.transcript.slice(0, 24_000),
          threadId:
            item.finalizedAt && item.transcript
              ? voiceDeviceUuid("voice-device-thread", id, item.sessionId)
              : null,
          messageId:
            item.finalizedAt && item.transcript
              ? voiceDeviceUuid(
                  "voice-device-event",
                  id,
                  item.sessionId,
                  "session-final",
                )
              : null,
        })),
        nextCursor:
          hasMore && last
            ? encodeVoiceDeviceSessionCursor({
                id: last.id,
                startedAt: last.cursorStartedAt,
              })
            : null,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not load voice device sessions" },
      { status: 500, headers: noStore },
    );
  }
}
