import { getSession } from "auth/server";
import { voiceDeviceRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
  const rate = await checkApiRateLimit({
    kind: "voice-device-revoke",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const revoked = await voiceDeviceRepository.revoke(id, session.user.id);
  return revoked
    ? Response.json({ ok: true })
    : new Response("Not found", { status: 404 });
}
