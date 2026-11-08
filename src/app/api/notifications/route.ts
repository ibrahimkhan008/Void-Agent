import { getSession } from "auth/server";
import { notificationRepository } from "lib/db/repository";
import {
  notificationTypeListSchema,
  safeNotificationHref,
} from "lib/notifications/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const parsedTypes =
    rawType === null ? null : notificationTypeListSchema.safeParse(rawType);
  if (parsedTypes && !parsedTypes.success)
    return Response.json({ error: "Invalid type" }, { status: 400 });

  const requested =
    Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30;
  const limit = Math.max(1, Math.min(100, requested));
  try {
    const types = parsedTypes?.success ? parsedTypes.data : undefined;
    const [rows, unreadCount] = await Promise.all([
      notificationRepository.list(session.user.id, limit, types),
      notificationRepository.unreadCount(session.user.id, types),
    ]);
    return Response.json(
      {
        notifications: rows.map((row) => ({
          ...row,
          href: safeNotificationHref(row.href),
        })),
        unreadCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return Response.json(
      { error: "Failed to fetch notifications" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
