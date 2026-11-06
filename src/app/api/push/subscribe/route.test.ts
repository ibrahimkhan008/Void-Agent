import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteSubscription: vi.fn(),
  rateLimit: vi.fn(),
  readBody: vi.fn(),
  sameOrigin: vi.fn(),
  saveSubscription: vi.fn(),
  configuredKey: vi.fn(),
  encryptionAvailable: vi.fn(),
  assertPublicUrl: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  notificationRepository: {
    deletePushSubscription: mocks.deleteSubscription,
    savePushSubscription: mocks.saveSubscription,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/notifications/contracts", () => ({
  isSameOriginRequest: mocks.sameOrigin,
  pushSubscriptionSchema: { safeParse: vi.fn() },
  readBoundedJson: mocks.readBody,
}));
vi.mock("lib/notifications/web-push", () => ({
  getVapidPublicKey: mocks.configuredKey,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: mocks.encryptionAvailable,
}));
vi.mock("lib/webhooks/url-guard", () => ({
  assertPublicWebhookUrl: mocks.assertPublicUrl,
}));

import { DELETE } from "./route";

const request = () =>
  new Request("https://void.test/api/push/subscribe", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "https://void.test",
    },
    body: JSON.stringify({ endpoint: "https://push.example/subscription" }),
  });

describe("DELETE push subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.readBody.mockResolvedValue({
      ok: true,
      value: { endpoint: "https://push.example/subscription" },
    });
    mocks.deleteSubscription.mockResolvedValue(true);
  });

  it("unsubscribes only the authenticated user's endpoint", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.deleteSubscription).toHaveBeenCalledWith(
      "user-1",
      "https://push.example/subscription",
    );
  });

  it("rejects cross-origin or unauthenticated mutations before deletion", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await DELETE(request())).status).toBe(403);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await DELETE(request())).status).toBe(401);
    expect(mocks.deleteSubscription).not.toHaveBeenCalled();
  });

  it("rejects malformed subscription bodies", async () => {
    mocks.readBody.mockResolvedValueOnce({ ok: true, value: { endpoint: 3 } });
    expect((await DELETE(request())).status).toBe(400);
    expect(mocks.deleteSubscription).not.toHaveBeenCalled();
  });
});
