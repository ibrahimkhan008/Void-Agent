import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/models", () => ({ customModelProvider: {} }));
vi.mock("lib/cache", () => ({ serverCache: {} }));
vi.mock("./crawl-gateway", () => ({
  isCrawlGatewayEnabled: vi.fn(() => false),
  runViaCrawlGateway: vi.fn(),
}));
vi.mock("./steel-fleet", () => ({
  allocateContainer: vi.fn(),
  createSteelSession: vi.fn(),
  releaseContainerAlloc: vi.fn(),
  releaseSteelSession: vi.fn(),
  steelBaseUrl: vi.fn(),
}));

describe("browser agent network isolation gate", () => {
  beforeEach(() => vi.resetModules());

  it.each([
    ["private IPv4 navigation", "http://10.0.0.7/admin"],
    ["IPv6 loopback navigation", "http://[::1]:9222/json"],
    ["metadata navigation", "http://169.254.169.254/latest/meta-data/"],
    ["DNS rebinding navigation", "https://rebind.example.test/"],
    [
      "redirect chain",
      "https://public.example.test/redirect?to=http://127.0.0.1",
    ],
    ["subresource fetch", "https://public.example.test/private-iframe"],
    ["WebSocket tunnel", "wss://public.example.test/socket"],
    ["proxy bypass", "http://localhost:3128/"],
    ["alternate protocol", "file:///etc/passwd"],
  ])("fails closed before allocation for %s", async (_attack, startUrl) => {
    const { createBrowserAgentToolForUser } = await import("./browser-agent");
    const { allocateContainer, createSteelSession } = await import(
      "./steel-fleet"
    );
    const { runViaCrawlGateway } = await import("./crawl-gateway");
    const tool = createBrowserAgentToolForUser("user-1", "thread-1");

    await expect(
      (tool as any).execute({ task: "Open this target", startUrl }, {}),
    ).resolves.toMatchObject({
      isError: true,
      error:
        "Browser automation is disabled until network isolation is verified.",
    });
    expect(allocateContainer).not.toHaveBeenCalled();
    expect(createSteelSession).not.toHaveBeenCalled();
    expect(runViaCrawlGateway).not.toHaveBeenCalled();
  });
});
