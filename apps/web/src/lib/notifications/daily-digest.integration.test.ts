import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Daily notification digest query-layer drill against the isolated
 * PostgreSQL cluster: the digest cron's exact query (24h window join over
 * notification ⋈ user) plus groupDailyDigestRecipients, exercised against
 * real rows — verified opted-in user grouped with the right count,
 * opted-out / unverified / non-digest-type rows excluded. SMTP delivery
 * itself is not exercised (no relay in this environment).
 */

import type { UserPreferences } from "app-types/user";
import { pgClient, pgDb } from "../db/pg/db.pg";
import { NotificationTable, UserTable } from "../db/pg/schema.pg";
import {
  DIGEST_NOTIFICATION_TYPES,
  buildDailyDigestEmail,
  groupDailyDigestRecipients,
} from "./daily-digest";

const configuredUrl = process.env.TEST_POSTGRES_URL;
const isAllowedIsolatedDb = (() => {
  if (!configuredUrl) return false;
  try {
    const parsed = new URL(configuredUrl);
    return (
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
      parsed.port === "55432" &&
      parsed.pathname === "/voidagent_migration_test" &&
      Number(process.env.POSTGRES_POOL_MAX ?? 1) >= 2
    );
  } catch {
    return false;
  }
})();

const integration = isAllowedIsolatedDb ? describe : describe.skip;

const optedIn = crypto.randomUUID();
const optedOut = crypto.randomUUID();
const unverified = crypto.randomUUID();

const optedInPrefs = {
  notifications: {
    emailEnabled: true,
    emailDigestEnabled: true,
    emailScheduledSuccess: true,
    emailScheduledFailure: true,
    emailHookFailure: true,
  },
} as UserPreferences;
const optedOutPrefs = {
  notifications: {
    emailEnabled: true,
    emailDigestEnabled: false,
  },
} as UserPreferences;

integration("daily digest query layer (isolated PostgreSQL)", () => {
  beforeAll(async () => {
    if (configuredUrl && !isAllowedIsolatedDb) {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 with POSTGRES_POOL_MAX >= 2",
      );
    }
    await Promise.all([
      pgDb.insert(UserTable).values({
        id: optedIn,
        name: "Digest opt-in",
        email: `${optedIn}@test.invalid`,
        emailVerified: true,
        preferences: optedInPrefs,
      }),
      pgDb.insert(UserTable).values({
        id: optedOut,
        name: "Digest opt-out",
        email: `${optedOut}@test.invalid`,
        emailVerified: true,
        preferences: optedOutPrefs,
      }),
      pgDb.insert(UserTable).values({
        id: unverified,
        name: "Digest unverified",
        email: `${unverified}@test.invalid`,
        emailVerified: false,
        preferences: optedInPrefs,
      }),
    ]);
    const now = Date.now();
    await pgDb.insert(NotificationTable).values([
      // Opted-in verified user: three digest-eligible events.
      {
        userId: optedIn,
        type: "scheduled_run_success",
        title: "s1",
        body: "b",
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
      },
      {
        userId: optedIn,
        type: "scheduled_run_failure",
        title: "s2",
        body: "b",
        createdAt: new Date(now - 1 * 60 * 60 * 1000),
      },
      {
        userId: optedIn,
        type: "hook_run_failure",
        title: "h1",
        body: "b",
        createdAt: new Date(now - 30 * 60 * 1000),
      },
      // Outside the 24h window — must NOT count.
      {
        userId: optedIn,
        type: "scheduled_run_success",
        title: "old",
        body: "b",
        createdAt: new Date(now - 30 * 60 * 60 * 1000),
      },
      // Opted-out and unverified users: rows exist but must be excluded.
      {
        userId: optedOut,
        type: "hook_run_failure",
        title: "x",
        body: "b",
        createdAt: new Date(now - 40 * 60 * 1000),
      },
      {
        userId: unverified,
        type: "hook_run_failure",
        title: "y",
        body: "b",
        createdAt: new Date(now - 40 * 60 * 1000),
      },
      // Opted-in user, but a non-digest event type: excluded by type filter.
      {
        userId: optedIn,
        type: "project_brain_updated",
        title: "z",
        body: "b",
        createdAt: new Date(now - 20 * 60 * 1000),
      },
    ]);
  });

  afterAll(async () => {
    if (isAllowedIsolatedDb) {
      const start = new Date(Date.now() - 31 * 60 * 60 * 1000);
      await pgDb
        .delete(NotificationTable)
        .where(and(gte(NotificationTable.createdAt, start)));
      await pgDb.delete(UserTable).where(eq(UserTable.id, optedIn));
      await pgDb.delete(UserTable).where(eq(UserTable.id, optedOut));
      await pgDb.delete(UserTable).where(eq(UserTable.id, unverified));
      await pgClient.end({ timeout: 5 });
    }
  });

  it("groups only verified opted-in users inside the 24h window", async () => {
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date();
    // The digest cron's exact query (notification-email-digest.ts).
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
    expect(recipients).toEqual([
      { userId: optedIn, email: `${optedIn}@test.invalid`, count: 3 },
    ]);
  });

  it("builds a generic summary email without event content", () => {
    const email = buildDailyDigestEmail(3, "https://app.test");
    expect(email.subject).toBe("Your Void Agent daily notification summary");
    expect(email.body).toContain("3");
    expect(email.body).not.toContain("scheduled_run");
    expect(email.body).not.toContain("hook_run");
  });
});
