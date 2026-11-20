import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: mocks.getConfig,
  },
}));

import { isOnboardingEnabled } from "./config";

describe("isOnboardingEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to false when no general config row exists", async () => {
    mocks.getConfig.mockResolvedValue(null);
    expect(await isOnboardingEnabled()).toBe(false);
  });

  it("returns false when onboardingFlow is false or unset", async () => {
    mocks.getConfig.mockResolvedValue({
      featureFlags: { voiceChat: true, onboardingFlow: false },
    });
    expect(await isOnboardingEnabled()).toBe(false);

    mocks.getConfig.mockResolvedValue({ featureFlags: { voiceChat: true } });
    expect(await isOnboardingEnabled()).toBe(false);
  });

  it("returns true when an admin explicitly enables onboardingFlow", async () => {
    mocks.getConfig.mockResolvedValue({
      featureFlags: { onboardingFlow: true },
    });
    expect(await isOnboardingEnabled()).toBe(true);
  });

  it("fails closed to false if the DB read throws", async () => {
    mocks.getConfig.mockRejectedValue(new Error("db unavailable"));
    expect(await isOnboardingEnabled()).toBe(false);
  });
});
