import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getResendClient: vi.fn(), send: vi.fn() }));

vi.mock("lib/email/resend", () => ({
  getResendClient: mocks.getResendClient,
}));

import { sendTeamInvitationEmail } from "./team-invitation-email";

describe("team invitation email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getResendClient.mockResolvedValue({
      resend: { emails: { send: mocks.send } },
      domain: "eu.example.test",
    });
    mocks.send.mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  it("escapes interpolated HTML and sends the fragment-only invitation URL", async () => {
    const result = await sendTeamInvitationEmail({
      to: "person@example.test",
      teamName: '<img src=x onerror="alert(1)">',
      inviterName: "A & B",
      acceptUrl: "https://example.test/team-invitations/accept#token=abc",
    });
    expect(result).toBe("sent");
    const [message] = mocks.send.mock.calls[0]!;
    expect(message.from).toBe("Void-Agent <noreply@eu.example.test>");
    expect(message.to).toBe("person@example.test");
    expect(message.subject).toContain("Void-Agent");
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img");
    expect(message.html).toContain("A &amp; B");
    expect(message.html).toContain("#token=abc");
  });

  it("reports unavailable email configuration and provider failure", async () => {
    mocks.getResendClient.mockResolvedValueOnce({ resend: null, domain: "" });
    await expect(
      sendTeamInvitationEmail({
        to: "person@example.test",
        teamName: "Research",
        inviterName: "Owner",
        acceptUrl: "https://example.test/team-invitations/accept#token=abc",
      }),
    ).resolves.toBe("unavailable");

    mocks.send.mockResolvedValueOnce({ error: new Error("provider error") });
    await expect(
      sendTeamInvitationEmail({
        to: "person@example.test",
        teamName: "Research",
        inviterName: "Owner",
        acceptUrl: "https://example.test/team-invitations/accept#token=abc",
      }),
    ).resolves.toBe("failed");
  });
});
