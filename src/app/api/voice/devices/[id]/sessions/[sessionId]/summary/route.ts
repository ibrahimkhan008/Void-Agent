import { getSession } from "auth/server";
import { voiceDeviceRepository } from "lib/db/pg/repositories/voice-device-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { summarizeLongVoiceCapture } from "lib/voice/long-capture-summary";
import { z } from "zod";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const sessionIdSchema = z.string().trim().min(1).max(120);
const noStore = { "Cache-Control": "no-store" };

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const { id: deviceId, sessionId } = await context.params;
  if (
    !uuidSchema.safeParse(deviceId).success ||
    !sessionIdSchema.safeParse(sessionId).success
  ) {
    return new Response("Not found", { status: 404, headers: noStore });
  }

  const rate = await checkApiRateLimit({
    kind: "voice-device-long-summary",
    id: session.user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many summary requests", {
      status: 429,
      headers: noStore,
    });

  try {
    const result = await voiceDeviceRepository.getFinalizedSessionTranscript({
      deviceId,
      userId: session.user.id,
      sessionId,
    });
    if (!result)
      return new Response("Capture not found", {
        status: 404,
        headers: noStore,
      });
    if (result.status !== "completed")
      return Response.json(
        { error: "Finalize this capture before requesting a summary." },
        { status: 409, headers: noStore },
      );
    if (!result.transcript.trim())
      return Response.json(
        { error: "This capture has no transcript to summarize." },
        { status: 422, headers: noStore },
      );

    const summary = await summarizeLongVoiceCapture(result.transcript);
    return Response.json({ summary }, { headers: noStore });
  } catch {
    return Response.json(
      {
        error:
          "Could not summarize this capture. Nothing was saved or executed.",
      },
      { status: 502, headers: noStore },
    );
  }
}
