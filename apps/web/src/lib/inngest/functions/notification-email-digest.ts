import { pgDb } from "@/lib/db/pg/db.pg";
import { NotificationTable, UserTable } from "@/lib/db/pg/schema.pg";
import {
  DIGEST_NOTIFICATION_TYPES,
  buildDailyDigestEmail,
  groupDailyDigestRecipients,
} from "@/lib/notifications/daily-digest";
import { sendSmtpEmail } from "@/lib/notifications/send-smtp-email";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { inngest } from "../client";

/** Send a private, generic digest once each day; event text is never emailed. */
export const notificationEmailDigest = inngest.createFunction(
  { id: "notification-email-digest", retries: 3 },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      return { skipped: true, reason: "SMTP is not configured", recipients: 0 };
    }

    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const recipients = await step.run("load-digest-recipients", async () => {
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
      return groupDailyDigestRecipients(rows);
    });

    let delivered = 0;
    for (const recipient of recipients) {
      await step.run(`send-digest-${recipient.userId}`, async () => {
        const message = buildDailyDigestEmail(
          recipient.count,
          process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
        );
        await sendSmtpEmail({
          to: recipient.email,
          ...message,
        });
        return { sent: true };
      });
      delivered += 1;
    }
    return { skipped: false, recipients: delivered };
  },
);
