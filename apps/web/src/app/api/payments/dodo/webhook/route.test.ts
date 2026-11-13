import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  parse: vi.fn(),
  getTier: vi.fn(),
  getProduct: vi.fn(),
  getSub: vi.fn(),
  getUser: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  payment: vi.fn(),
  claim: vi.fn(),
  mark: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  dodoPaymentsRepository: {
    getSubscriptionByDodoId: mocks.getSub,
    upsertSubscription: mocks.upsert,
    updateSubscription: mocks.update,
    recordPayment: mocks.payment,
    recordWebhookReceived: mocks.claim,
    markWebhookProcessed: mocks.mark,
  },
  userRepository: { getUserById: mocks.getUser },
}));
vi.mock("lib/payments/dodo", () => ({
  getDodoProductIdForTier: mocks.getProduct,
  getTierForDodoProductId: mocks.getTier,
  isDodoPaymentsEnabled: mocks.enabled,
  parseWebhookRequest: mocks.parse,
}));

import { POST } from "./route";

const request = () =>
  new Request("https://local.test/api/payments/dodo/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "evt_123",
      "webhook-timestamp": "1",
      "webhook-signature": "v1,test",
    },
    body: JSON.stringify({ signed: true }),
  });

describe("Dodo webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.parse.mockResolvedValue({
      webhookId: "evt_123",
      eventType: "subscription.active",
      eventTimestamp: new Date("2026-11-09T08:00:00Z"),
      payload: {
        data: {
          subscription_id: "sub_123",
          product_id: "prod_pro",
          customer: { customer_id: "cus_123" },
          metadata: { voidagentUserId: "user-1", tier: "voidagent-pro" },
        },
      },
    });
    mocks.getTier.mockResolvedValue("voidagent-pro");
    mocks.getProduct.mockResolvedValue("prod_pro");
    mocks.getSub.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ id: "user-1" });
    mocks.upsert.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.payment.mockResolvedValue({});
    mocks.claim.mockResolvedValue({
      claimed: true,
      claimToken: "claim-1",
      existing: null,
    });
    mocks.mark.mockResolvedValue(true);
  });

  it("applies only product-mapped activation and completes its claim", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        dodoSubscriptionId: "sub_123",
        eventTimestamp: new Date("2026-11-09T08:00:00Z"),
        dodoCustomerId: "cus_123",
        tier: "voidagent-pro",
        status: "active",
      }),
    );
    expect(mocks.mark).toHaveBeenCalledWith("evt_123", "claim-1");
    expect(mocks.claim).toHaveBeenCalledWith("evt_123", "subscription.active", {
      eventTimestamp: "2026-11-09T08:00:00.000Z",
      subscriptionId: "sub_123",
      paymentId: null,
      productId: "prod_pro",
    });
  });

  it("rejects state-changing events without the provider event timestamp", async () => {
    mocks.parse.mockResolvedValueOnce({
      webhookId: "evt_123",
      eventType: "subscription.active",
      eventTimestamp: null,
      payload: {},
    });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("records the provider total_amount and preserves only a minimal event summary", async () => {
    mocks.parse.mockResolvedValueOnce({
      webhookId: "evt_payment",
      eventType: "payment.succeeded",
      eventTimestamp: new Date("2026-11-09T08:00:00Z"),
      payload: {
        type: "payment.succeeded",
        timestamp: "2026-11-09T08:00:00.000Z",
        data: {
          payment_id: "pay_123",
          subscription_id: "sub_123",
          product_id: "prod_pro",
          total_amount: 2999,
          amount: 0,
          currency: "USD",
          customer: { email: "private@example.test" },
          metadata: { voidagentUserId: "user-1", secret: "must-not-persist" },
        },
      },
    });
    mocks.getSub.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.payment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2999,
        eventTimestamp: new Date("2026-11-09T08:00:00Z"),
      }),
    );
    expect(mocks.claim).toHaveBeenCalledWith(
      "evt_payment",
      "payment.succeeded",
      {
        eventTimestamp: "2026-11-09T08:00:00.000Z",
        subscriptionId: "sub_123",
        paymentId: "pay_123",
        productId: "prod_pro",
      },
    );
    expect(JSON.stringify(mocks.claim.mock.calls.at(-1))).not.toContain(
      "private@example.test",
    );
    expect(JSON.stringify(mocks.claim.mock.calls.at(-1))).not.toContain(
      "must-not-persist",
    );
  });

  it("does not process an event whose signature verification fails", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("invalid signature"));
    expect((await POST(request())).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("acknowledges an already-processed replay without dispatching it again", async () => {
    mocks.claim.mockResolvedValueOnce({
      claimed: false,
      claimToken: null,
      existing: { processedAt: new Date() },
    });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("returns retryable failure and releases only the current claim when persistence fails", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("database down"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.mark).toHaveBeenCalledWith(
      "evt_123",
      "claim-1",
      "database down",
    );
  });

  it("refuses to change ownership of an already-linked subscription", async () => {
    mocks.getSub.mockResolvedValueOnce({ userId: "another-user" });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.mark).toHaveBeenCalledWith(
      "evt_123",
      "claim-1",
      expect.stringContaining("owner"),
    );
  });
});
