import { voiceDeviceRepository } from "lib/db/pg/repositories/voice-device-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { deviceVoiceSegmentSchema } from "lib/voice/device-session";
import { readVoiceJsonBody } from "lib/voice/session-thread-contract";

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
    kind: "voice-device-segment",
    id: device.id,
    limit: 120,
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
  const body = await readVoiceJsonBody(request, 16_384);
  if (!body.ok)
    return Response.json(
      {
        error:
          body.reason === "too-large"
            ? "Request body too large"
            : "Invalid request",
      },
      { status: body.reason === "too-large" ? 413 : 400, headers: noStore },
    );
  const parsed = deviceVoiceSegmentSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid transcript segment" },
      { status: 400, headers: noStore },
    );
  try {
    const result = await voiceDeviceRepository.appendTranscriptSegment(
      device,
      sessionId,
      parsed.data,
    );
    if ("missing" in result)
      return new Response("Not found", { status: 404, headers: noStore });
    if ("closed" in result)
      return new Response("Voice session is closed", {
        status: 409,
        headers: noStore,
      });
    if ("full" in result)
      return new Response("Voice session segment limit reached", {
        status: 409,
        headers: noStore,
      });
    if ("conflict" in result)
      return new Response(
        "Transcript event conflicts with an existing segment",
        { status: 409, headers: noStore },
      );
    return Response.json(
      { ok: true, replay: result.replay, segmentCount: result.segmentCount },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not save transcript segment" },
      { status: 500, headers: noStore },
    );
  }
}
