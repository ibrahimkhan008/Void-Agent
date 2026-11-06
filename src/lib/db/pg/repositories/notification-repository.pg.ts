import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { decrypt, encrypt } from "lib/security/encryption";
import { pgDb as db } from "../db.pg";
import { NotificationTable, PushSubscriptionTable } from "../schema.pg";

export const notificationRepository = {
  async createIfNew(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    href?: string | null;
    dedupeKey: string;
  }) {
    const [row] = await db
      .insert(NotificationTable)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  },
  async create(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    href?: string | null;
    dedupeKey?: string | null;
  }) {
    const [row] = await db
      .insert(NotificationTable)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (row || !input.dedupeKey) return row ?? null;
    const [existing] = await db
      .select()
      .from(NotificationTable)
      .where(
        and(
          eq(NotificationTable.userId, input.userId),
          eq(NotificationTable.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    return existing ?? null;
  },
  async list(userId: string, limit = 30) {
    return db
      .select()
      .from(NotificationTable)
      .where(eq(NotificationTable.userId, userId))
      .orderBy(desc(NotificationTable.createdAt), desc(NotificationTable.id))
      .limit(Math.max(1, Math.min(100, limit)));
  },
  async unreadCount(userId: string) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(NotificationTable)
      .where(
        and(
          eq(NotificationTable.userId, userId),
          isNull(NotificationTable.readAt),
        ),
      );
    return row?.count ?? 0;
  },
  async markRead(userId: string, ids?: string[]) {
    const where = and(
      eq(NotificationTable.userId, userId),
      isNull(NotificationTable.readAt),
      ...(ids?.length ? [inArray(NotificationTable.id, ids)] : []),
    );
    const rows = await db
      .update(NotificationTable)
      .set({ readAt: new Date() })
      .where(where)
      .returning({ id: NotificationTable.id });
    return rows.length;
  },
  async savePushSubscription(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }) {
    const values = {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dhEncrypted: encrypt(input.p256dh),
      authEncrypted: encrypt(input.auth),
      userAgent: input.userAgent?.slice(0, 512) ?? null,
    };
    await db
      .insert(PushSubscriptionTable)
      .values(values)
      .onConflictDoUpdate({
        target: [PushSubscriptionTable.userId, PushSubscriptionTable.endpoint],
        set: {
          p256dhEncrypted: values.p256dhEncrypted,
          authEncrypted: values.authEncrypted,
          userAgent: values.userAgent,
        },
      });
  },
  async listPushSubscriptions(userId: string) {
    const rows = await db
      .select()
      .from(PushSubscriptionTable)
      .where(eq(PushSubscriptionTable.userId, userId));
    return rows.map((row) => ({
      ...row,
      p256dh: decrypt(row.p256dhEncrypted),
      auth: decrypt(row.authEncrypted),
    }));
  },
  async deletePushSubscription(userId: string, endpoint: string) {
    const rows = await db
      .delete(PushSubscriptionTable)
      .where(
        and(
          eq(PushSubscriptionTable.userId, userId),
          eq(PushSubscriptionTable.endpoint, endpoint),
        ),
      )
      .returning({ id: PushSubscriptionTable.id });
    return rows.length > 0;
  },
};
