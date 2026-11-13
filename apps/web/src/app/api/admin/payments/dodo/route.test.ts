import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
  encrypt: vi.fn(),
  isEncryptionAvailable: vi.fn(),
  dodoConfig: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig, upsert: mocks.upsert },
}));
vi.mock("lib/security/encryption", () => ({
  encrypt: mocks.encrypt,
  isEncryptionAvailable: mocks.isEncryptionAvailable,
}));
vi.mock("lib/payments/dodo-config", async () => {
  const actual = await vi.importActual<
    typeof import("lib/payments/dodo-config")
  >("lib/payments/dodo-config");
  return { ...actual, getDodoConfig: mocks.dodoConfig };
});

import { GET, POST } from "./route";

const request = (body: unknown) =>
  new Request("https://local.test/api/admin/payments/dodo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://local.test",
    },
    body: JSON.stringify(body),
  });

describe("admin Dodo configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "payments"
        ? {
            dodo: {
              retain: true,
              productIds: { "voidagent-max": "old-product" },
            },
          }
        : { apiKeysSecrets: { keep: "untouched" } },
    );
    mocks.upsert.mockResolvedValue(undefined);
    mocks.encrypt.mockImplementation((value: string) => `encrypted:${value}`);
    mocks.isEncryptionAvailable.mockReturnValue(true);
    mocks.dodoConfig.mockResolvedValue({
      enabled: true,
      environment: "test_mode",
      apiKey: "hidden-api",
      webhookSecret: "hidden-webhook",
      apiKeySource: "db",
      webhookSecretSource: "db",
    });
  });

  it("returns enabled state and secret presence, never secret values", async () => {
    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('"billingEnabled":true');
    expect(text).toContain('"configured":true');
    expect(text).not.toContain("hidden-api");
    expect(text).not.toContain("hidden-webhook");
  });

  it("encrypts credentials, merges product ids, and does not return submitted secrets", async () => {
    const response = await POST(
      request({
        enabled: true,
        environment: "live_mode",
        productIds: { "voidagent-pro": "new-product", "voidagent-max": "" },
        apiKey: "plain-api",
        webhookSecret: "plain-webhook",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.encrypt).toHaveBeenNthCalledWith(1, "plain-api");
    expect(mocks.encrypt).toHaveBeenNthCalledWith(2, "plain-webhook");
    const paymentWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "payments",
    );
    expect(paymentWrite?.[1].dodo).toMatchObject({
      retain: true,
      enabled: true,
      environment: "live_mode",
      productIds: { "voidagent-pro": "new-product" },
    });
    const toolsWrite = mocks.upsert.mock.calls.find(([key]) => key === "tools");
    expect(toolsWrite?.[1].apiKeysSecrets).toEqual({
      keep: "untouched",
      dodo_api_key: "encrypted:plain-api",
      dodo_webhook_secret: "encrypted:plain-webhook",
    });
    const text = await response.text();
    expect(text).not.toContain("plain-api");
    expect(text).not.toContain("plain-webhook");
  });

  it("rejects non-admin, cross-origin, invalid configuration and secrets without encryption", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect((await POST(request({ environment: "live_mode" }))).status).toBe(
      401,
    );
    const crossOrigin = new Request(
      "https://local.test/api/admin/payments/dodo",
      {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
        body: "{}",
      },
    );
    expect((await POST(crossOrigin)).status).toBe(403);
    expect((await POST(request({ environment: "production" }))).status).toBe(
      400,
    );
    mocks.isEncryptionAvailable.mockReturnValue(false);
    expect((await POST(request({ apiKey: "plain-api" }))).status).toBe(503);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
