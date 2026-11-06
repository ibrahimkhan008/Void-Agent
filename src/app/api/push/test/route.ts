import { getSession } from "auth/server";
import { notificationRepository } from "lib/db/repository";
import { isSameOriginRequest } from "lib/notifications/contracts";
import {
  isWebPushConfigured,
  sendPushToUser,
} from "lib/notifications/web-push";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "push-test",
    id: session.user.id,
    limit: 3,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  if (!isWebPushConfigured())
    return Response.json(
      { error: "Push delivery is not configured" },
      { status: 503 },
    );
  try {
    const rows = await notificationRepository.listPushSubscriptions(
      session.user.id,
    );
    if (!rows.length)
      return Response.json(
        { error: "No browser subscription is registered" },
        { status: 404 },
      );
    const result = await sendPushToUser(session.user.id, {
      title: "Void-Agent notification test",
      body: "Browser notifications are connected.",
      href: "/notifications",
    });
    if (result.sent === 0)
      return Response.json(
        { error: "No active browser subscription received the test" },
        { status: 502 },
      );
    await notificationRepository.create({
      userId: session.user.id,
      type: "push_test",
      title: "Notification test sent",
      body: "A test notification was sent to your browser.",
      href: "/notifications",
      dedupeKey: null,
    });
    return Response.json({ ok: true, sent: result.sent });
  } catch {
    return Response.json(
      { error: "Could not send a test notification" },
      { status: 502 },
    );
  }
}
