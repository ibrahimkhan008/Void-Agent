import { getSession } from "auth/server";
import { notificationRepository } from "lib/db/repository";
import {
  isSameOriginRequest,
  pushSubscriptionSchema,
  readBoundedJson,
} from "lib/notifications/contracts";
import { getVapidPublicKey } from "lib/notifications/web-push";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { isEncryptionAvailable } from "lib/security/encryption";
import { assertPublicWebhookUrl } from "lib/webhooks/url-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  return Response.json(
    {
      publicKey: getVapidPublicKey(),
      encryptionAvailable: isEncryptionAvailable(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "push-subscribe",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  if (!isEncryptionAvailable())
    return Response.json(
      { error: "Push subscription encryption is not configured" },
      { status: 503 },
    );
  const body = await readBoundedJson(request);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = pushSubscriptionSchema.safeParse(body.value);
  if (!parsed.success)
    return new Response("Invalid subscription", { status: 400 });
  try {
    await assertPublicWebhookUrl(parsed.data.endpoint);
    await notificationRepository.savePushSubscription({
      userId: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not register this push endpoint" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "push-unsubscribe",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  if (
    !body.value ||
    typeof body.value !== "object" ||
    typeof (body.value as { endpoint?: unknown }).endpoint !== "string" ||
    (body.value as { endpoint: string }).endpoint.length > 2048
  )
    return new Response("Invalid endpoint", { status: 400 });
  await notificationRepository.deletePushSubscription(
    session.user.id,
    (body.value as { endpoint: string }).endpoint,
  );
  return Response.json({ ok: true });
}
