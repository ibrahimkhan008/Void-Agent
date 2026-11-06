import { getSession } from "auth/server";
import { notificationRepository } from "lib/db/repository";
import { safeNotificationHref } from "lib/notifications/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 30);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(100, requested)) : 30;
  const [rows, unreadCount] = await Promise.all([notificationRepository.list(session.user.id, limit), notificationRepository.unreadCount(session.user.id)]);
  return Response.json({ notifications: rows.map((row) => ({ ...row, href: safeNotificationHref(row.href) })), unreadCount });
}
