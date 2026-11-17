import "server-only";

import { BASE_URL } from "@/lib/const";
import { pgDb } from "@/lib/db/pg/db.pg";
import { NotificationTable, UserTable } from "@/lib/db/pg/schema.pg";
import {
  DIGEST_NOTIFICATION_TYPES,
  buildDailyDigestEmail,
  groupDailyDigestRecipients,
} from "@/lib/notifications/daily-digest";
import { sendSmtpEmail } from "@/lib/notifications/send-smtp-email";
import { and, gte, inArray, lt } from "drizzle-orm";
import logger from "logger";

/**
 * The daily digest job body, shared by both drivers: the Inngest cron
 * function (step-wrapped retries) and the Inngest-free HTTP cron route
 * (/api/background-jobs/email-digest, driven by the VPS systemd timer).
 * Event text is never emailed — a generic count-only summary per recipient.
 */
export async function runDailyDigest(): Promise<{
  skipped: boolean;
  reason?: string;
  recipients: number;
  sent: number;
  failed: number;
}> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    return {
      skipped: true,
      reason: "SMTP is not configured",
      recipients: 0,
      sent: 0,
      failed: 0,
    };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const rows = await pgDb
    .select({
      userId: UserTable.id,
      email: UserTable.email,
      verified: UserTable.emailVerified,
      preferences: UserTable.preferences,
      type: NotificationTable.type,
    })
    .from(NotificationTable)
    .innerJoin(UserTable, eq(UserTable.id, NotificationTable.userId))
    .where(
      and(
        gte(NotificationTable.createdAt, start),
        lt(NotificationTable.createdAt, end),
        inArray(NotificationTable.type, [...DIGEST_NOTIFICATION_TYPES]),
      ),
    );
  const recipients = groupDailyDigestRecipients(rows);

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const message = buildDailyDigestEmail(recipient.count, BASE_URL);
    try {
      await sendSmtpEmail({ to: recipient.email, ...message });
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        `[digest] failed to email ${recipient.email}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { skipped: false, recipients: recipients.length, sent, failed };
}
