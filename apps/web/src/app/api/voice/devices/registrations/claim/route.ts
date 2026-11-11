import { getSession } from "auth/server";
import { voiceDeviceCustomRepository } from "lib/db/repository";
import {
  isSameOriginRequest,
  readBoundedJson,
} from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { isEncryptionAvailable } from "lib/security/encryption";
import { claimOtaRegistrationSchema } from "lib/voice/device-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Cross-origin request rejected", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "voice-device-ota-claim",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = claimOtaRegistrationSchema.safeParse(body.value);
  if (!parsed.success)
    return new Response("Invalid activation code", { status: 400 });
  if (!isEncryptionAvailable())
    return Response.json(
      { error: "Voice device credential encryption is not configured" },
      { status: 503 },
    );
  try {
    const registration = await voiceDeviceCustomRepository.claimOtaRegistration(
      {
        code: parsed.data.code,
        userId: session.user.id,
        displayName: parsed.data.displayName ?? "Void-Agent Voice Device",
      },
    );
    if (!registration)
      return Response.json(
        { error: "Invalid, expired, or already claimed activation code" },
        { status: 400 },
      );
    return Response.json(
      {
        registrationId: registration.id,
        displayName: registration.displayName,
        status: "claimed",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not claim voice device" },
      { status: 503 },
    );
  }
}
