import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  apiConfigured: vi.fn(),
  lookup: vi.fn(),
  getSub: vi.fn(),
  list: vi.fn(),
  getUser: vi.fn(),
  upsert: vi.fn(),
  getTier: vi.fn(),
  getProduct: vi.fn(),
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
  dodoPaymentsRepository: {
    getSubscriptionByDodoId: mocks.getSub,
    listSubscriptionsForUser: mocks.list,
    upsertSubscription: mocks.upsert,
  },
  userRepository: { getUserById: mocks.getUser },
}));
vi.mock("lib/payments/dodo", () => ({
  DodoPaymentsError: class extends Error {
    status = 404;
  },
  getDodoSubscription: mocks.lookup,
  isDodoApiConfigured: mocks.apiConfigured,
  getTierForDodoProductId: mocks.getTier,
  getDodoProductIdForTier: mocks.getProduct,
}));

import { POST } from "./route";
const request = (body: unknown) =>
  new Request("https://app.test/api/payments/dodo/reconcile", {
    method: "POST",
    headers: { Origin: "https://app.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Dodo subscription reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.apiConfigured.mockResolvedValue(true);
    mocks.lookup.mockResolvedValue({
      subscriptionId: "sub_123",
      productId: "prod_pro",
      customerId: "cus_123",
      status: "active",
      previousBillingDate: null,
      nextBillingDate: null,
      cancelAtNextBillingDate: false,
      metadata: { voidagentUserId: "owner" },
    });
    mocks.getSub.mockResolvedValue(null);
    mocks.list.mockResolvedValue([{ tier: "voidagent-pro", status: "active" }]);
    mocks.getUser.mockResolvedValue({ id: "owner" });
    mocks.upsert.mockResolvedValue({});
    mocks.getTier.mockResolvedValue("voidagent-pro");
    mocks.getProduct.mockResolvedValue("prod_pro");
  });
  it("applies only an active subscription whose verified owner matches the session", async () => {
    const response = await POST(request({ subscriptionId: "sub_123" }));
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner",
        dodoSubscriptionId: "sub_123",
        tier: "voidagent-pro",
        status: "active",
      }),
    );
  });
  it("rejects a subscription bound to another user before changing tier", async () => {
    mocks.lookup.mockResolvedValueOnce({
      ...(await mocks.lookup()),
      metadata: { voidagentUserId: "victim" },
    });
    const response = await POST(request({ subscriptionId: "sub_123" }));
    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects inactive provider state and invalid bodies", async () => {
    mocks.lookup.mockResolvedValueOnce({
      ...(await mocks.lookup()),
      status: "cancelled",
    });
    expect((await POST(request({ subscriptionId: "sub_123" }))).status).toBe(
      409,
    );
    expect(
      (await POST(request({ subscriptionId: "../../other" }))).status,
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires same-origin authentication and limits requests before provider lookup", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request({ subscriptionId: "sub_123" }))).status).toBe(
      401,
    );
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request({ subscriptionId: "sub_123" }))).status).toBe(
      429,
    );
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
