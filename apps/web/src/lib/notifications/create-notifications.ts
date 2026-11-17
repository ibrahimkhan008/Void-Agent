import "server-only";

import { pgDb } from "@/lib/db/pg/db.pg";
import { NotificationTable, UserTable } from "@/lib/db/pg/schema.pg";
import { safeNotificationHref } from "@/lib/notifications/contracts";
import { sendSmtpEmail } from "@/lib/notifications/send-smtp-email";
import { sendPushToUser } from "@/lib/push/send-push-to-user";
import { inArray } from "drizzle-orm";

export type CreateNotificationsInput = {
  userIds: string[];
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  /**
   * Per-user idempotency key. Rows that already exist for (user, key) are
   * skipped and receive no push, so a replayed producer stays silent.
   */
  dedupeKey?: string | null;
  threadId?: string | null;
  agentId?: string | null;
  push?: { kind?: string; tag?: string } | false;
};

/**
 * Insert one in-app notification per recipient and push to the ones that were
 * actually inserted. Push failures are logged and never thrown: the bell row is
 * the durable record, push is best-effort.
 */
export async function createNotifications(input: CreateNotificationsInput) {
  const userIds = [...new Set(input.userIds)];
  if (!userIds.length)
    return { inserted: [] as Array<{ id: string; userId: string }> };

  const inserted = await pgDb
    .insert(NotificationTable)
    .values(
      userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        dedupeKey: input.dedupeKey ?? null,
        threadId: input.threadId ?? null,
        agentId: input.agentId ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: NotificationTable.id, userId: NotificationTable.userId });

  const push = input.push === false ? null : (input.push ?? {});
  if (push && inserted.length) {
    await Promise.allSettled(
      inserted.map(async (row) => {
        try {
          await sendPushToUser(row.userId, {
            title: input.title,
            body: input.body ?? "",
            url: input.url ?? undefined,
            kind: push.kind,
            tag: push.tag,
          });
        } catch (error) {
          console.warn("[notifications] push failed", row.userId, error);
        }
      }),
    );
  }

  // Email is opt-in and only sent to verified account addresses. Keep the
  // message body out of email because notification bodies can contain user
  // prompts or task data; the in-app notification remains the full record.
  const emailEligibleType =
    input.type === "scheduled_run_success" ||
    input.type === "scheduled_run_failure" ||
    input.type === "hook_run_failure";
  if (
    emailEligibleType &&
    inserted.length &&
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM
  ) {
    const recipients = await pgDb
      .select({
        userId: UserTable.id,
        email: UserTable.email,
        verified: UserTable.emailVerified,
        preferences: UserTable.preferences,
      })
      .from(UserTable)
      .where(
        inArray(
          UserTable.id,
          inserted.map((row) => row.userId),
        ),
      );
    await Promise.allSettled(
      recipients
        .filter((recipient) => {
          const preferences = recipient.preferences as {
            notifications?: {
              emailEnabled?: boolean;
              emailScheduledSuccess?: boolean;
              emailScheduledFailure?: boolean;
              emailHookFailure?: boolean;
            };
          } | null;
          const notificationPrefs = preferences?.notifications;
          const eventEnabled =
            input.type === "scheduled_run_success"
              ? notificationPrefs?.emailScheduledSuccess !== false
              : input.type === "scheduled_run_failure"
                ? notificationPrefs?.emailScheduledFailure !== false
                : notificationPrefs?.emailHookFailure !== false;
          return (
            recipient.verified &&
            notificationPrefs?.emailEnabled === true &&
            eventEnabled
          );
        })
        .map(async (recipient) => {
          try {
            const href = safeNotificationHref(input.url ?? "/") ?? "/";
            await sendSmtpEmail({
              to: recipient.email,
              subject: input.title,
              body: `A notification is available in Void Agent.\n\nOpen: ${new URL(href, process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").toString()}`,
            });
          } catch (error) {
            console.warn(
              "[notifications] email failed",
              recipient.userId,
              error,
            );
          }
        }),
    );
  }

  return { inserted };
}
