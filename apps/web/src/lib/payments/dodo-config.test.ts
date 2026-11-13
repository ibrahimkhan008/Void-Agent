import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), decrypt: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
}));
vi.mock("lib/security/encryption", () => ({ decrypt: mocks.decrypt }));

import {
  getDodoConfig,
  getDodoProductIdForTier,
  getTierForDodoProductId,
} from "./dodo-config";

describe("Dodo configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "payments"
        ? {
            dodo: {
              enabled: true,
              environment: "live_mode",
              productIds: { "voidagent-pro": "prod_db" },
            },
          }
        : {
            apiKeysSecrets: {
              dodo_api_key: "api-cipher",
              dodo_webhook_secret: "hook-cipher",
            },
          },
    );
    mocks.decrypt.mockImplementation((value: string) =>
      value === "api-cipher" ? "api-secret" : "hook-secret",
    );
  });

  it("reads encrypted admin credentials and product configuration without changing upstream billing", async () => {
    const config = await getDodoConfig();
    expect(config).toMatchObject({
      apiKey: "api-secret",
      webhookSecret: "hook-secret",
      environment: "live_mode",
      enabled: true,
      apiKeySource: "db",
      webhookSecretSource: "db",
    });
    expect(await getDodoProductIdForTier("voidagent-pro")).toBe("prod_db");
    expect(await getTierForDodoProductId("prod_db")).toBe("voidagent-pro");
    expect(await getDodoProductIdForTier("free")).toBeNull();
  });

  it("prefers environment secrets and product ids over admin-stored values", async () => {
    vi.stubEnv("DODO_PAYMENTS_API_KEY", "env-api");
    vi.stubEnv("DODO_WEBHOOK_SECRET", "env-hook");
    vi.stubEnv("DODO_ENVIRONMENT", "test_mode");
    vi.stubEnv("DODO_PRODUCT_VOIDAGENT_PRO", "prod_env");
    const config = await getDodoConfig();
    expect(config).toMatchObject({
      apiKey: "env-api",
      webhookSecret: "env-hook",
      environment: "test_mode",
      apiKeySource: "env",
      webhookSecretSource: "env",
    });
    expect(await getDodoProductIdForTier("voidagent-pro")).toBe("prod_env");
  });
});
