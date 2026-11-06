import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { deviceTranscriptSchema } from "lib/voice/device-transcript";
import { persistVoiceDeviceTranscript } from "lib/voice/device-transcript-store";
import { readVoiceJsonBody } from "lib/voice/session-thread-contract";

export const dynamic = "force-dynamic";

/** Accepts a recognized command from an enrolled device and saves it to the owner's chat history.
 * Commands are deliberately not auto-executed here; MCP/agent actions require the normal approval flow.
 */
export async function POST(request: Request) {
  const device = await authenticateVoiceDevice(request);
  if (!device) return new Response("Unauthorized", { status: 401 });

  const rate = await checkApiRateLimit({ kind: "voice-device-transcript", id: device.id, limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many voice requests", { status: 429 });

  const body = await readVoiceJsonBody(request, 16_384);
  if (!body.ok) return Response.json({ error: body.reason === "too-large" ? "Request body too large" : "Invalid JSON" }, { status: body.reason === "too-large" ? 413 : 400 });
  const parsed = deviceTranscriptSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Invalid transcript" }, { status: 400 });

  try {
    const stored = await persistVoiceDeviceTranscript(device, parsed.data);
    if (stored.forbidden) return new Response("Forbidden", { status: 403 });
    return Response.json({ ok: true, threadId: stored.threadId, messageId: stored.messageId, persisted: true, action: "saved_for_review" });
  } catch {
    return Response.json({ error: "Could not save voice transcript" }, { status: 500 });
  }
}
