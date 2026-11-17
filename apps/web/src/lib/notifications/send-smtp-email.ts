import "server-only";

import nodemailer from "nodemailer";

export type OutboundEmail = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
};

/** Fail visibly when an operator has not configured an outbound mail relay. */
export async function sendSmtpEmail(email: OutboundEmail): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "Outbound email requires SMTP_HOST, SMTP_FROM, and a valid SMTP_PORT",
    );
  }

  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });
  try {
    await transport.sendMail({
      from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      text: email.body,
    });
  } finally {
    transport.close();
  }
}
