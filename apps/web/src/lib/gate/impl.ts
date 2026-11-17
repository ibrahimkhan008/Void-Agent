import "server-only";
import { sendSmtpEmail } from "@/lib/notifications/send-smtp-email";
import type {
  BillingContext,
  CreatedUser,
  Feature,
  NotificationEmail,
  OrganizationInvitation,
  PasswordResetEmail,
} from "./types";

/**
 * Community implementation of the billing/entitlement seam.
 *
 * This edition has no billing provider: nothing is metered, every feature is
 * available, and there is no customer to bill. Each function keeps the
 * signature its cloud counterpart has so callers never branch on the edition.
 */

/** Session-derived identity. `customerId` is null: nothing is billed here. */
export async function getBillingContext(): Promise<BillingContext | null> {
  const { getSession } = await import("@/lib/auth/auth-instance");
  const session = await getSession();
  if (!session?.user) return null;

  return {
    customerId: null,
    userId: session.user.id,
    customerData: {
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  };
}

export async function requireBillingContext(): Promise<BillingContext> {
  const context = await getBillingContext();
  if (!context) throw new Error("Unauthorized - No valid session found");
  return context;
}

/** No credit pool to exhaust. */
export async function assertCreditsAvailable(_input: {
  customerId: string | null;
  entityId?: string;
}): Promise<void> {}

/** Every feature is included; availability is decided by configuration. */
export async function checkFeature(
  _feature: Feature,
  _input: { customerId?: string | null; entityId?: string } = {},
): Promise<boolean> {
  return true;
}

export async function requireFeature(
  _feature: Feature,
  _input: { customerId?: string | null; entityId?: string } = {},
): Promise<void> {}

/** No CRM to sync new accounts into. */
export async function onUserCreated(_user: CreatedUser): Promise<void> {}

/** Send an organization invitation through the configured SMTP relay. */
export async function sendOrgInvitationEmail(
  invitation: OrganizationInvitation,
): Promise<void> {
  await sendSmtpEmail({
    to: invitation.email,
    subject: `Invitation to join ${invitation.teamName}`,
    body: `${invitation.invitedByUsername} (${invitation.invitedByEmail}) invited you to join ${invitation.teamName}.\n\nAccept the invitation: ${invitation.inviteLink}`,
  });
}

/** Send operator notifications through the configured SMTP relay. */
export async function sendNotificationEmail(
  email: NotificationEmail,
): Promise<void> {
  await sendSmtpEmail(email);
}

/** Send the token-bearing password reset link through the configured relay. */
export async function sendPasswordResetEmail(
  email: PasswordResetEmail,
): Promise<void> {
  await sendSmtpEmail({
    to: email.email,
    subject: "Reset your Void Agent password",
    body: `Hello${email.name ? ` ${email.name}` : ""},\n\nUse the link below to reset your password. If you did not request a reset, ignore this email.\n\n${email.resetUrl}`,
  });
}
