import { getSession } from "auth/server";
import { notificationRepository } from "lib/db/repository";
import {
  isSameOriginRequest,
  notificationReadSchema,
  readBoundedJson,
} from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "notification-read",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 4_096);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = notificationReadSchema.safeParse(body.value);
  if (!parsed.success)
    return new Response("Invalid notification selection", { status: 400 });
  const updated = await notificationRepository.markRead(
    session.user.id,
    parsed.data.ids,
  );
  return Response.json({ updated });
}
