import { getResendClient } from "lib/email/resend";
import logger from "logger";

export type TeamInvitationDelivery = "sent" | "unavailable" | "failed";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export async function sendTeamInvitationEmail(input: {
  to: string;
  teamName: string;
  inviterName: string;
  acceptUrl: string;
}): Promise<TeamInvitationDelivery> {
  try {
    const { resend, domain } = await getResendClient();
    if (!resend) return "unavailable";
    const html = `<p>${escapeHtml(input.inviterName || "A team administrator")} invited you to join <strong>${escapeHtml(input.teamName)}</strong> on Void-Agent.</p><p><a href="${escapeHtml(input.acceptUrl)}">Review invitation</a></p><p>This link expires in seven days and can only be used by the invited, verified email account.</p>`;
    const safeTeamName = input.teamName.replace(/[\r\n]+/g, " ").slice(0, 120);
    const result = await resend.emails.send({
      from: `Void-Agent <noreply@${domain}>`,
      to: input.to,
      subject: `Invitation to join ${safeTeamName} on Void-Agent`,
      html,
      headers: { "Referrer-Policy": "no-referrer" },
    });
    if (result.error) {
      logger.error(
        "Team invitation email provider rejected a message.",
        result.error,
      );
      return "failed";
    }
    return "sent";
  } catch (error) {
    logger.error("Team invitation email could not be sent.", error);
    return "failed";
  }
}
