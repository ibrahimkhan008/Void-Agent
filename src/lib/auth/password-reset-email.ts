import { sendEmail } from "lib/email/resend";
import { getPasswordResetEmailHtml } from "lib/email/templates";

export function validatePasswordResetUrl(
  resetUrl: string,
  configuredBaseUrl?: string,
): string {
  const url = new URL(resetUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Password reset URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Password reset URL cannot include credentials");
  }
  if (configuredBaseUrl && url.origin !== new URL(configuredBaseUrl).origin) {
    throw new Error(
      "Password reset URL did not match the configured auth origin",
    );
  }
  return url.href;
}

export async function sendPasswordResetEmail(input: {
  email: string;
  name: string;
  resetUrl: string;
  configuredBaseUrl?: string;
  deliver?: typeof sendEmail;
}) {
  const resetUrl = validatePasswordResetUrl(
    input.resetUrl,
    input.configuredBaseUrl,
  );
  await (input.deliver ?? sendEmail)({
    to: input.email,
    subject: "Reset your Void-Agent password",
    html: getPasswordResetEmailHtml(input.name, resetUrl),
    from: "auth",
  });
}
