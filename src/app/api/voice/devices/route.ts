import { getSession } from "auth/server";
import { voiceDeviceRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { createDevicePairingSchema } from "lib/voice/device-schema";
import { generateVoicePairingCode } from "lib/voice/device-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const devices = await voiceDeviceRepository.listByUserId(session.user.id);
  return Response.json({ devices });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const rate = await checkApiRateLimit({ kind: "voice-device-pair-code", id: session.user.id, limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok) return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", { status: body.tooLarge ? 413 : 400 });
  const parsed = createDevicePairingSchema.safeParse(body.value);
  if (!parsed.success) return new Response("Invalid pairing request", { status: 400 });
  try {
    const code = generateVoicePairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await voiceDeviceRepository.createPairingCode({ userId: session.user.id, deviceType: parsed.data.deviceType, displayName: parsed.data.displayName ?? null, code, expiresAt });
    return Response.json({ code, expiresAt: expiresAt.toISOString(), deviceType: parsed.data.deviceType });
  } catch {
    return Response.json({ error: "Voice device pairing is not configured" }, { status: 503 });
  }
}
