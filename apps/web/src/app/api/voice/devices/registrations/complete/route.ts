import { createHash } from "node:crypto";
import { getBaseUrl } from "lib/const";
import { voiceDeviceCustomRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { completeOtaRegistrationSchema } from "lib/voice/device-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = completeOtaRegistrationSchema.safeParse(body.value);
  if (!parsed.success)
    return new Response("Invalid registration proof", { status: 400 });
  try {
    const ip =
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ??
      "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex");
    const [ipRate, registrationRate] = await Promise.all([
      checkApiRateLimit({
        kind: "voice-device-ota-complete-ip",
        id: ipHash,
        limit: 30,
        windowMs: 60_000,
      }),
      checkApiRateLimit({
        kind: "voice-device-ota-complete-registration",
        id: parsed.data.registrationId,
        limit: 10,
        windowMs: 10 * 60_000,
      }),
    ]);
    if (!ipRate.allowed || !registrationRate.allowed)
      return new Response("Too many requests", { status: 429 });
    const result = await voiceDeviceCustomRepository.completeOtaRegistration(
      parsed.data,
    );
    if (!result)
      return Response.json(
        { error: "Registration is not ready or has already completed" },
        { status: 400 },
      );
    return Response.json(
      {
        deviceId: result.deviceId,
        token: result.token,
        apiBaseUrl: getBaseUrl() || null,
        status: "completed",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not complete device registration" },
      { status: 503 },
    );
  }
}
