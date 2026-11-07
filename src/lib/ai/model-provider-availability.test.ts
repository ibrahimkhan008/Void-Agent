import { describe, expect, it, vi } from "vitest";
import {
  filterEnabledChatProviders,
  isChatModelProviderEnabled,
  isChatProviderEnabled,
} from "./model-provider-availability";

const mocks = vi.hoisted(() => ({ session: vi.fn(), owns: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: vi.fn() },
  userModelProviderRepository: { isOwnedModel: mocks.owns },
}));

describe("chat model provider availability", () => {
  it("honors static provider disablement case-insensitively", () => {
    expect(
      isChatProviderEnabled("Flare", {
        providers: { flare: { enabled: false } },
      }),
    ).toBe(false);
    expect(
      isChatProviderEnabled("flare", {
        providers: { Flare: { enabled: true } },
      }),
    ).toBe(true);
  });

  it("honors disabled static providers in the legacy array config shape", () => {
    expect(
      isChatProviderEnabled("Flare", {
        providers: [{ id: "flare", enabled: false }],
      }),
    ).toBe(false);
    expect(
      isChatProviderEnabled("flare", {
        providers: [{ id: "Flare", enabled: true }],
      }),
    ).toBe(true);
  });

  it("defaults omitted static providers to enabled and dynamic providers to disabled", () => {
    expect(isChatProviderEnabled("google", null)).toBe(true);
    expect(
      isChatProviderEnabled("custom-gateway", {
        dynamicProviders: { "custom-gateway": {} },
      }),
    ).toBe(false);
    expect(
      isChatProviderEnabled("custom-gateway", {
        dynamicProviders: { "custom-gateway": { enabled: true } },
      }),
    ).toBe(true);
  });

  it("filters disabled static and dynamic providers from the chat catalog", () => {
    const providers = [
      { provider: "flare", models: ["A"] },
      { provider: "google", models: ["B"] },
      { provider: "custom-gateway", models: ["C"] },
    ];
    expect(
      filterEnabledChatProviders(providers, {
        providers: { flare: { enabled: false } },
        dynamicProviders: { "custom-gateway": { enabled: true } },
      }),
    ).toEqual([providers[1], providers[2]]);
  });

  it("only enables a personal provider model when the current session owns it", async () => {
    mocks.session.mockResolvedValue({ user: { id: "owner-a" } });
    mocks.owns.mockResolvedValueOnce(true);
    await expect(
      isChatModelProviderEnabled({ provider: "user-provider-a", model: "m1" }),
    ).resolves.toBe(true);
    expect(mocks.owns).toHaveBeenCalledWith("owner-a", "provider-a", "m1");

    mocks.session.mockResolvedValueOnce(null);
    await expect(
      isChatModelProviderEnabled({ provider: "user-provider-a", model: "m1" }),
    ).resolves.toBe(false);
  });
});
