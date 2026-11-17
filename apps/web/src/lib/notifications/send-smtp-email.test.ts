import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, close, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const close = vi.fn();
  return {
    sendMail,
    close,
    createTransport: vi.fn(() => ({ sendMail, close })),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { sendSmtpEmail } from "./send-smtp-email";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_FROM", "alerts@example.test");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("sendSmtpEmail", () => {
  it("sends plaintext through a TLS-required relay", async () => {
    await sendSmtpEmail({
      to: "operator@example.test",
      subject: "Report",
      body: "Something happened",
    });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 587,
      secure: false,
      requireTLS: true,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "alerts@example.test",
      to: "operator@example.test",
      cc: undefined,
      subject: "Report",
      text: "Something happened",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("refuses missing relay configuration without pretending to send", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(
      sendSmtpEmail({ to: "operator@example.test", subject: "x", body: "x" }),
    ).rejects.toThrow("SMTP_HOST");
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("requires both SMTP credentials and propagates send failures", async () => {
    vi.stubEnv("SMTP_USER", "operator");
    await expect(
      sendSmtpEmail({ to: "operator@example.test", subject: "x", body: "x" }),
    ).rejects.toThrow("together");
    vi.stubEnv("SMTP_PASSWORD", "test-password");
    sendMail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    await expect(
      sendSmtpEmail({ to: "operator@example.test", subject: "x", body: "x" }),
    ).rejects.toThrow("SMTP unavailable");
  });
});
