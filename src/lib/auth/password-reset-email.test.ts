import { describe, expect, it, vi } from "vitest";
import {
  sendPasswordResetEmail,
  validatePasswordResetUrl,
} from "./password-reset-email";

vi.mock("server-only", () => ({}));
vi.mock("lib/email/resend", () => ({ sendEmail: vi.fn() }));

describe("password reset email", () => {
  it("delivers a single-use auth URL and escapes names and URL content", async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    await sendPasswordResetEmail({
      email: "person@example.com",
      name: "<img src=x onerror=alert(1)>",
      resetUrl:
        "https://void.example/api/auth/reset-password/opaque-token?callbackURL=%2Freset-password",
      configuredBaseUrl: "https://void.example",
      deliver: deliver as never,
    });
    expect(deliver).toHaveBeenCalledOnce();
    const payload = deliver.mock.calls[0][0];
    expect(payload.to).toBe("person@example.com");
    expect(payload.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(payload.html).toContain(
      "https://void.example/api/auth/reset-password/",
    );
    expect(payload.html).not.toContain("<img");
  });

  it("rejects a reset URL on an unconfigured origin", async () => {
    const deliver = vi.fn();
    await expect(
      sendPasswordResetEmail({
        email: "person@example.com",
        name: "Person",
        resetUrl: "https://attacker.example/reset?token=secret",
        configuredBaseUrl: "https://void.example",
        deliver: deliver as never,
      }),
    ).rejects.toThrow("configured auth origin");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects URL credentials and unsafe protocols", () => {
    expect(() => validatePasswordResetUrl("javascript:alert(1)")).toThrow();
    expect(() =>
      validatePasswordResetUrl("https://user:pass@void.example/reset"),
    ).toThrow("cannot include credentials");
  });
});
