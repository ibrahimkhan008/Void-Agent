import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
const sendSmtpEmail = vi.fn();
vi.mock("@/lib/notifications/send-smtp-email", () => ({
  sendSmtpEmail: (...args: unknown[]) => sendSmtpEmail(...args),
}));
vi.mock("@/lib/auth/auth-instance", () => ({
  getSession: () => getSession(),
}));

import {
  assertCreditsAvailable,
  checkFeature,
  getBillingContext,
  requireBillingContext,
  requireFeature,
  sendNotificationEmail,
  sendOrgInvitationEmail,
  sendPasswordResetEmail,
} from "./impl";
import { checkMeteredFeature, trackUsage } from "./metering";

/**
 * The community gate has one job: never block, never meter, never report.
 * These assertions are the contract the rest of the app is written against.
 */
describe("community gate", () => {
  it("derives identity from the session with no billing customer", async () => {
    getSession.mockResolvedValue({
      user: { id: "user_1", email: "a@example.com", name: "A", image: null },
    });

    await expect(getBillingContext()).resolves.toEqual({
      customerId: null,
      userId: "user_1",
      customerData: { email: "a@example.com", name: "A", image: null },
    });
  });

  it("still refuses an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);

    await expect(getBillingContext()).resolves.toBeNull();
    await expect(requireBillingContext()).rejects.toThrow(/Unauthorized/);
  });

  it("never blocks on credits or entitlements", async () => {
    await expect(
      assertCreditsAvailable({ customerId: null }),
    ).resolves.toBeUndefined();
    await expect(checkFeature("local_models")).resolves.toBe(true);
    await expect(checkFeature("exaai")).resolves.toBe(true);
    await expect(requireFeature("local_models")).resolves.toBeUndefined();
    await expect(checkMeteredFeature("exaai")).resolves.toBe(true);
  });

  it("reports no usage and no billed totals", async () => {
    await expect(
      trackUsage({
        kind: "tokens",
        customerId: "anything",
        modelId: "openai/gpt-5.6-terra",
        promptTokens: 10,
        completionTokens: 20,
        idempotencyKey: "msg_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("delivers operator, invitation, and password reset mail via SMTP", async () => {
    await sendNotificationEmail({
      to: "ops@example.test",
      subject: "Report",
      body: "Issue",
    });
    await sendOrgInvitationEmail({
      email: "new@example.test",
      invitedByUsername: "A",
      invitedByEmail: "a@example.test",
      teamName: "Team",
      inviteLink: "https://void.test/invite/token",
    });
    await sendPasswordResetEmail({
      email: "new@example.test",
      name: "New User",
      resetUrl: "https://void.test/reset/token",
    });
    expect(sendSmtpEmail).toHaveBeenCalledTimes(3);
    expect(sendSmtpEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: "new@example.test",
        subject: "Reset your Void Agent password",
        body: expect.stringContaining("https://void.test/reset/token"),
      }),
    );
  });
});
