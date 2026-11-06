import { createHash } from "node:crypto";
import { voiceDeviceRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { redeemDevicePairingSchema } from "lib/voice/device-schema";
import { hashVoiceDeviceSecret } from "lib/voice/device-token";

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok) return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", { status: body.tooLarge ? 413 : 400 });
  const parsed = redeemDevicePairingSchema.safeParse(body.value);
  if (!parsed.success) return new Response("Invalid pairing code", { status: 400 });
  try {
    const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
    const ipKey = createHash("sha256").update(ip).digest("hex");
    const [ipRate, codeRate] = await Promise.all([
      checkApiRateLimit({ kind: "voice-device-pair-ip", id: ipKey, limit: 30, windowMs: 60_000 }),
      checkApiRateLimit({ kind: "voice-device-pair-code", id: hashVoiceDeviceSecret("pair", parsed.data.code), limit: 5, windowMs: 10 * 60_000 }),
    ]);
    if (!ipRate.allowed || !codeRate.allowed) return new Response("Too many pairing attempts", { status: 429 });
    const result = await voiceDeviceRepository.consumePairingCodeAndCreateDevice(parsed.data);
    if (!result) return Response.json({ error: "Invalid or expired pairing code" }, { status: 400 });
    return Response.json({ deviceId: result.device.id, token: result.token, deviceType: result.device.deviceType, displayName: result.device.displayName, apiBaseUrl: process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ?? null });
  } catch {
    return Response.json({ error: "Could not complete device pairing" }, { status: 503 });
  }
}
