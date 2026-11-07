import { describe, expect, it, vi } from "vitest";
import { isPasswordResetRateLimited } from "./password-reset-rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: vi.fn(),
}));

describe("password reset abuse protection", () => {
  it("uses a shared hourly bucket keyed by a normalized non-plaintext address", async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    expect(
      await isPasswordResetRateLimited(
        "  Person@Example.com ",
        checkLimit as never,
      ),
    ).toBe(false);
    expect(checkLimit).toHaveBeenCalledWith({
      kind: "auth-password-reset-email",
      id: expect.stringMatching(/^[a-f0-9]{64}$/),
      limit: 3,
      windowMs: 3_600_000,
    });
    expect(JSON.stringify(checkLimit.mock.calls)).not.toContain(
      "Person@Example.com",
    );
  });

  it("blocks the fourth request after the recipient bucket is exhausted", async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: false });
    await expect(
      isPasswordResetRateLimited("person@example.com", checkLimit as never),
    ).resolves.toBe(true);
  });

  it("fails closed for empty addresses", async () => {
    const checkLimit = vi.fn();
    await expect(
      isPasswordResetRateLimited(" ", checkLimit as never),
    ).resolves.toBe(true);
    expect(checkLimit).not.toHaveBeenCalled();
  });
});
