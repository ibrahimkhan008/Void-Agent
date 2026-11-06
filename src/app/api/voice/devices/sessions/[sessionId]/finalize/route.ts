import { voiceDeviceRepository } from "lib/db/pg/repositories/voice-device-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { persistVoiceDeviceTranscript } from "lib/voice/device-transcript-store";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const device = await authenticateVoiceDevice(request);
  if (!device)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-device-session-finalize",
    id: device.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many voice requests", {
      status: 429,
      headers: noStore,
    });
  const { sessionId } = await params;
  if (!sessionId || sessionId.length > 120)
    return new Response("Not found", { status: 404, headers: noStore });
  try {
    const result = await voiceDeviceRepository.finalizeTranscriptSession(
      device,
      sessionId,
    );
    if (result.missing)
      return new Response("Not found", { status: 404, headers: noStore });
    if ("closed" in result)
      return new Response("Voice session cannot be finalized", {
        status: 409,
        headers: noStore,
      });
    if (!result.transcript)
      return Response.json(
        {
          ok: true,
          status: result.status,
          segmentCount: result.segmentCount,
          action: "empty_session",
        },
        { headers: noStore },
      );
    const saved = await persistVoiceDeviceTranscript(device, {
      sessionId,
      eventId: "session-final",
      text: result.transcript,
    });
    if (saved.forbidden)
      return new Response("Forbidden", { status: 403, headers: noStore });
    return Response.json(
      {
        ok: true,
        status: result.status,
        segmentCount: result.segmentCount,
        threadId: saved.threadId,
        messageId: saved.messageId,
        action: "saved_for_review",
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not finalize voice session" },
      { status: 500, headers: noStore },
    );
  }
}
