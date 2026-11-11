import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBrowserAutomationGate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/routing/service", () => ({
  resolveBrowserAutomationGate: mocks.resolveBrowserAutomationGate,
}));
vi.mock("lib/kernel/client", () => ({ IS_KERNEL_CONFIGURED: true }));

import { resolveVoiceBrowserSuppression } from "./browser-gate";

describe("voice browser global egress gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not expose voice browser tools or read org policy without explicit provider isolation", async () => {
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "false");
    mocks.resolveBrowserAutomationGate.mockResolvedValue({ enabled: true });

    await expect(
      resolveVoiceBrowserSuppression({
        userId: "user-1",
        organizationId: "org-1",
      }),
    ).resolves.toBe("provider-level browser egress isolation is not enabled");
    expect(mocks.resolveBrowserAutomationGate).not.toHaveBeenCalled();
  });
});
