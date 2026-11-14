import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repo: {
    claimPendingOutboxEvents: vi.fn(),
    listWebhookSubscriptions: vi.fn(),
    getWebhookSubscriptionSigningSecret: vi.fn(),
    createWebhookDelivery: vi.fn(),
    markWebhookDeliveryDelivered: vi.fn(),
    markWebhookDeliveryFailed: vi.fn(),
    markOutboxEventDelivered: vi.fn(),
    markOutboxEventFailed: vi.fn(),
    failOutboxEvent: vi.fn(),
    updateWebhookSubscriptionStats: vi.fn(),
    getEventDeliveries: vi.fn(),
  },
  deliverWebhook: vi.fn(),
  signPayload: vi.fn(),
  computeBackoffMs: vi.fn(),
  createFunction: vi.fn(),
  registration: [] as unknown[][],
}));

vi.mock("../client", () => ({
  inngest: {
    createFunction: (...args: unknown[]) => {
      mocks.registration.push(args);
      return { id: (args[0] as { id: string }).id };
    },
  },
}));

vi.mock("logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("lib/db/pg/repositories/webhook-repository.pg", () => ({
  webhookRepository: mocks.repo,
}));

vi.mock("lib/webhooks", () => ({
  computeBackoffMs: mocks.computeBackoffMs,
  deliverWebhook: mocks.deliverWebhook,
  signPayload: mocks.signPayload,
}));

import { runWebhookOutboxTick, webhookOutboxTick } from "./webhook-outbox";

const NOW = new Date("2026-11-11T00:00:00Z");

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  kind: "inbound",
  eventType: "inbound.received",
  payload: { userId: "owner-1", endpointId: "ep-1" },
  status: "pending",
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: NOW,
  lastError: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-1",
  userId: "owner-1",
  url: "https://receiver.example.com/hook",
  eventTypes: [] as string[],
  secretHash: "hash",
  signingSecret: null,
  description: null,
  enabled: true,
  failureCount: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeDelivery = (overrides: Record<string, unknown> = {}) => ({
  id: "delivery-1",
  eventId: "event-1",
  subscriptionId: "sub-1",
  status: "pending",
  attempts: 0,
  lastError: null,
  deliveredAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signPayload.mockReturnValue({
    signature: "sig",
    timestamp: "1700000000",
  });
  mocks.computeBackoffMs.mockReturnValue(2000);
  mocks.repo.createWebhookDelivery.mockImplementation(async (input) =>
    makeDelivery({
      subscriptionId: input.subscriptionId,
      id: `delivery-${input.subscriptionId}`,
    }),
  );
  mocks.repo.getEventDeliveries.mockResolvedValue([]);
  mocks.repo.getWebhookSubscriptionSigningSecret.mockResolvedValue("secret");
});

describe("webhook outbox tick (zip-main outbox-worker port)", () => {
  it("is registered as an inngest cron function", () => {
    expect(mocks.registration.length).toBeGreaterThan(0);
    const [options, trigger] = mocks.registration[0];
    expect(options).toMatchObject({ id: "webhook-outbox-tick" });
    expect(trigger).toEqual({ cron: "* * * * *" });
    // The exported handle is the function returned by the (mocked)
    // inngest.createFunction call for this registration.
    expect(webhookOutboxTick).toEqual({ id: "webhook-outbox-tick" });
  });

  it("retires an event with no matching subscriptions", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([makeEvent()]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([]);

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, retried: 0 , hooksDispatched: 0 });
    expect(mocks.repo.markOutboxEventDelivered).toHaveBeenCalledWith("event-1");
    expect(mocks.deliverWebhook).not.toHaveBeenCalled();
  });

  it("signs, delivers, and records a successful delivery", async () => {
    const event = makeEvent();
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([event]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([makeSubscription()]);
    mocks.deliverWebhook.mockResolvedValue({ ok: true, status: 200 });

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, retried: 0 , hooksDispatched: 0 });
    expect(mocks.signPayload).toHaveBeenCalledWith(
      expect.stringContaining('"eventType":"inbound.received"'),
      "secret",
    );
    const envelope = JSON.parse(mocks.signPayload.mock.calls[0][0]);
    expect(envelope).toMatchObject({
      id: "event-1",
      eventType: "inbound.received",
      payload: { userId: "owner-1" },
    });
    expect(mocks.repo.createWebhookDelivery).toHaveBeenCalledWith({
      eventId: "event-1",
      subscriptionId: "sub-1",
    });
    expect(mocks.deliverWebhook).toHaveBeenCalledWith({
      url: "https://receiver.example.com/hook",
      payload: expect.any(String),
      signature: "sig",
      timestamp: "1700000000",
      timeoutMs: 10_000,
    });
    expect(mocks.repo.markWebhookDeliveryDelivered).toHaveBeenCalledWith(
      "delivery-sub-1",
    );
    expect(mocks.repo.updateWebhookSubscriptionStats).toHaveBeenCalledWith(
      "sub-1",
      { lastSuccessAt: expect.any(Date) },
    );
    expect(mocks.repo.markOutboxEventDelivered).toHaveBeenCalledWith("event-1");
    expect(mocks.repo.failOutboxEvent).not.toHaveBeenCalled();
  });

  it("schedules a backoff retry when every delivery fails under the cap", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([
      makeEvent({ attempts: 0, maxAttempts: 5 }),
    ]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([makeSubscription()]);
    mocks.deliverWebhook.mockResolvedValue({
      ok: false,
      status: 500,
      error: "boom",
    });

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 0, retried: 1 , hooksDispatched: 0 });
    expect(mocks.repo.markWebhookDeliveryFailed).toHaveBeenCalledWith(
      "delivery-sub-1",
      "HTTP 500 boom",
    );
    expect(mocks.repo.updateWebhookSubscriptionStats).toHaveBeenCalledWith(
      "sub-1",
      expect.objectContaining({
        failureCount: 1,
        lastFailureReason: "HTTP 500 boom",
      }),
    );
    expect(mocks.repo.failOutboxEvent).toHaveBeenCalledWith(
      "event-1",
      "delivery failed",
      expect.any(Date),
      1,
    );
    const nextAttemptAt = mocks.repo.failOutboxEvent.mock.calls[0][2];
    expect(nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("fails the event terminally once max attempts are exhausted", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([
      makeEvent({ attempts: 4, maxAttempts: 5 }),
    ]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([makeSubscription()]);
    mocks.deliverWebhook.mockResolvedValue({ ok: false, error: "nope" });

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1, retried: 0 , hooksDispatched: 0 });
    expect(mocks.repo.failOutboxEvent).toHaveBeenCalledWith(
      "event-1",
      "exceeded max attempts (5)",
      null,
      5,
    );
  });

  it("fails malformed payloads terminally without delivering", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([
      makeEvent({ payload: { endpointId: "ep-1" } }),
    ]);

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1, retried: 0 , hooksDispatched: 0 });
    expect(mocks.repo.failOutboxEvent).toHaveBeenCalledWith(
      "event-1",
      "payload missing userId",
      null,
    );
    expect(mocks.deliverWebhook).not.toHaveBeenCalled();
  });

  it("reuses an existing delivery row and never re-sends a delivered one", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([makeEvent()]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([makeSubscription()]);
    mocks.repo.getEventDeliveries.mockResolvedValue([
      makeDelivery({ status: "delivered", deliveredAt: NOW }),
    ]);

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, retried: 0 , hooksDispatched: 0 });
    expect(mocks.repo.createWebhookDelivery).not.toHaveBeenCalled();
    expect(mocks.deliverWebhook).not.toHaveBeenCalled();
    expect(mocks.repo.markOutboxEventDelivered).toHaveBeenCalledWith("event-1");
  });

  it("skips disabled subscriptions and subscriptions without a signing secret", async () => {
    mocks.repo.claimPendingOutboxEvents.mockResolvedValue([makeEvent()]);
    mocks.repo.listWebhookSubscriptions.mockResolvedValue([
      makeSubscription({ id: "sub-disabled", enabled: false }),
      makeSubscription({ id: "sub-nosecret" }),
    ]);
    mocks.repo.getWebhookSubscriptionSigningSecret.mockImplementation(
      async (subscriptionId: string) =>
        subscriptionId === "sub-disabled" ? "secret" : null,
    );

    const result = await runWebhookOutboxTick();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, retried: 0 , hooksDispatched: 0 });
    expect(mocks.deliverWebhook).not.toHaveBeenCalled();
    expect(mocks.repo.createWebhookDelivery).not.toHaveBeenCalled();
  });
});
