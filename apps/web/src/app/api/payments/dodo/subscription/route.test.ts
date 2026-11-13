import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  list: vi.fn(),
  enabled: vi.fn(),
  product: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  dodoPaymentsRepository: { listSubscriptionsForUser: mocks.list },
  userRepository: { getUserById: mocks.user },
}));
vi.mock("lib/payments/dodo", () => ({
  isDodoPaymentsEnabled: mocks.enabled,
  getDodoProductIdForTier: mocks.product,
}));

import { GET } from "./route";

describe("Dodo subscription summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ id: "user-1", tier: "voidagent-pro" });
    mocks.list.mockResolvedValue([
      {
        id: "internal-id",
        userId: "user-1",
        dodoSubscriptionId: "sub_private",
        dodoCustomerId: "cus_private",
        status: "active",
        tier: "voidagent-pro",
        previousBillingDate: null,
        nextBillingDate: null,
        cancelAtNextBillingDate: false,
        cancelledAt: null,
      },
    ]);
    mocks.enabled.mockResolvedValue(true);
    mocks.product.mockResolvedValue("prod_private");
  });
  it("returns only the caller's subscription state and no provider identifiers", async () => {
    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('"tier":"voidagent-pro"');
    expect(text).not.toContain("sub_private");
    expect(text).not.toContain("cus_private");
    expect(text).not.toContain("prod_private");
    expect(text).not.toContain("internal-id");
  });
  it("rejects unauthenticated users before reading subscriptions", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
