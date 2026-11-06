import { voiceDeviceRepository } from "lib/db/pg/repositories/voice-device-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { deviceVoiceSessionStartSchema } from "lib/voice/device-session";
import { readVoiceJsonBody } from "lib/voice/session-thread-contract";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const device = await authenticateVoiceDevice(request);
  if (!device)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-device-session-start",
    id: device.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many voice requests", {
      status: 429,
      headers: noStore,
    });
  const body = await readVoiceJsonBody(request, 4_096);
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
  const parsed = deviceVoiceSessionStartSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid voice session" },
      { status: 400, headers: noStore },
    );
  try {
    const session = await voiceDeviceRepository.startTranscriptSession(
      device,
      parsed.data.sessionId,
    );
    if (!session)
      return Response.json(
        { error: "Could not start voice session" },
        { status: 500, headers: noStore },
      );
    return Response.json(
      {
        ok: true,
        sessionId: parsed.data.sessionId,
        status: session.status,
        segmentCount: session.segmentCount,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not start voice session" },
      { status: 500, headers: noStore },
    );
  }
}
