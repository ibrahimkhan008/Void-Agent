import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { returning, where, sendSmtpEmail, sendPushToUser } = vi.hoisted(() => ({
  returning: vi.fn(),
  where: vi.fn(),
  sendSmtpEmail: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning }),
      }),
    }),
    select: () => ({
      from: () => ({ where }),
    }),
  },
}));
vi.mock("@/lib/push/send-push-to-user", () => ({ sendPushToUser }));
vi.mock("@/lib/notifications/send-smtp-email", () => ({ sendSmtpEmail }));

import { createNotifications } from "./create-notifications";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_FROM", "alerts@example.test");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.test");
  returning.mockResolvedValue([
    { id: "notification-1", userId: "u1" },
    { id: "notification-2", userId: "u2" },
    { id: "notification-3", userId: "u3" },
  ]);
  where.mockResolvedValue([
    {
      userId: "u1",
      email: "enabled@example.test",
      verified: true,
      preferences: { notifications: { emailEnabled: true } },
    },
    {
      userId: "u2",
      email: "unverified@example.test",
      verified: false,
      preferences: { notifications: { emailEnabled: true } },
    },
    {
      userId: "u3",
      email: "disabled@example.test",
      verified: true,
      preferences: { notifications: { emailEnabled: false } },
    },
  ]);
});

afterEach(() => vi.unstubAllEnvs());

describe("createNotifications email delivery", () => {
  it("emails only verified opt-in users for scheduled and hook results", async () => {
    await createNotifications({
      userIds: ["u1", "u2", "u3"],
      type: "scheduled_run_failure",
      title: "A task failed",
      body: "private prompt details",
      url: "/schedules",
      push: false,
    });

    expect(sendSmtpEmail).toHaveBeenCalledTimes(1);
    expect(sendSmtpEmail).toHaveBeenCalledWith({
      to: "enabled@example.test",
      subject: "A task failed",
      body: "A notification is available in Void Agent.\n\nOpen: https://app.example.test/schedules",
    });
    expect(JSON.stringify(sendSmtpEmail.mock.calls)).not.toContain(
      "private prompt details",
    );
  });

  it("does not send email for unrelated notification types", async () => {
    await createNotifications({
      userIds: ["u1"],
      type: "project_brain_updated",
      title: "Project updated",
      push: false,
    });

    expect(sendSmtpEmail).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });

  it("does not send duplicate email when the notification was already recorded", async () => {
    returning.mockResolvedValueOnce([]);
    await createNotifications({
      userIds: ["u1"],
      type: "hook_run_failure",
      title: "A hook failed",
      dedupeKey: "delivery-1",
      push: false,
    });

    expect(sendSmtpEmail).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });

  it("keeps email links on the app origin", async () => {
    returning.mockResolvedValueOnce([{ id: "notification-1", userId: "u1" }]);
    where.mockResolvedValueOnce([
      {
        userId: "u1",
        email: "enabled@example.test",
        verified: true,
        preferences: { notifications: { emailEnabled: true } },
      },
    ]);
    await createNotifications({
      userIds: ["u1"],
      type: "hook_run_failure",
      title: "A hook failed",
      url: "//outside.example/phishing",
      push: false,
    });

    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "A notification is available in Void Agent.\n\nOpen: https://app.example.test/",
      }),
    );
  });
});
