import { getSession } from "auth/server";
import { voiceDeviceRepository } from "lib/db/repository";
import { isSameOriginRequest } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });

  const rate = await checkApiRateLimit({
    kind: "voice-device-credential-rotate",
    id: session.user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
    });

  try {
    const result = await voiceDeviceRepository.rotateCredential(
      id,
      session.user.id,
    );
    if (!result)
      return new Response("Device not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    return Response.json(
      {
        deviceId: result.device.id,
        displayName: result.device.displayName,
        token: result.token,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { error: "Could not rotate device credential" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
