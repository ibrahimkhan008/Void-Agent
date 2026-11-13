import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  user: vi.fn(),
  enabled: vi.fn(),
  product: vi.fn(),
  checkout: vi.fn(),
  token: vi.fn(),
  base: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === "https://app.test",
}));
vi.mock("lib/db/repository", () => ({
  userRepository: { getUserById: mocks.user },
}));
vi.mock("lib/const", () => ({ getBaseUrl: mocks.base }));
vi.mock("lib/payments/dodo", () => ({
  isDodoPaymentsEnabled: mocks.enabled,
  getDodoProductIdForTier: mocks.product,
  createCheckoutSession: mocks.checkout,
}));
vi.mock("lib/payments/upgrade-token", () => ({
  createUpgradeToken: mocks.token,
}));

import { POST } from "./route";
const request = (body: unknown, origin = "https://app.test") =>
  new Request("https://app.test/api/payments/dodo/checkout", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Dodo checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "u@example.test" },
    });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.user.mockResolvedValue({
      id: "user-1",
      email: "u@example.test",
      name: "User",
    });
    mocks.enabled.mockResolvedValue(true);
    mocks.product.mockResolvedValue("prod_server_configured");
    mocks.checkout.mockResolvedValue({
      checkoutUrl: "https://checkout.dodopayments.com/session",
      sessionId: "sess_1",
    });
    mocks.token.mockReturnValue("signed-token");
    mocks.base.mockReturnValue("https://app.test");
  });
  it("uses a server-mapped product and user-bound return token", async () => {
    const response = await POST(request({ tier: "voidagent-pro" }));
    expect(response.status).toBe(200);
    expect(mocks.product).toHaveBeenCalledWith("voidagent-pro");
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "prod_server_configured",
        customer: expect.objectContaining({ userId: "user-1" }),
        tier: "voidagent-pro",
      }),
    );
    expect((await response.json()).checkoutUrl).toBe(
      "https://checkout.dodopayments.com/session",
    );
  });
  it("rejects unauthorized, cross-origin, and caller-selected product input", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request({ tier: "voidagent-pro" }))).status).toBe(401);
    expect(
      (await POST(request({ tier: "voidagent-pro" }, "https://attacker.test")))
        .status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({ tier: "voidagent-pro", productId: "attacker-product" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
