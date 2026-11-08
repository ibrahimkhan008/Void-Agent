import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheDelete: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/cache", () => ({
  serverCache: {
    delete: mocks.cacheDelete,
    get: mocks.cacheGet,
    set: mocks.cacheSet,
  },
}));

type BridgeCall = {
  pathname: string;
  authorization: string | null;
};

const calls: BridgeCall[] = [];

const response = (payload: Record<string, unknown>) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }) as Response;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("CLOAK_BRIDGE_URL", "http://127.0.0.1:3322");
  vi.stubEnv("CLOAK_BRIDGE_TOKEN", "");
  mocks.cacheGet.mockResolvedValue(undefined);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.cacheDelete.mockResolvedValue(undefined);
  calls.length = 0;
  mocks.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const parsedUrl = new URL(String(input));
      const authorization = new Headers(init?.headers).get("Authorization");
      calls.push({ pathname: parsedUrl.pathname, authorization });

      if (parsedUrl.pathname === "/session") {
        return response({ sessionId: "test-session" });
      }
      return response({ url: "https://example.com", title: "Example" });
    },
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("CloakBrowser bridge credentials", () => {
  it.each([
    ["loopback", "http://127.0.0.1:3000/admin"],
    ["IPv6 loopback", "http://[::1]:3000/"],
    ["private IPv4", "http://10.0.0.5/internal"],
    ["link-local metadata", "http://169.254.169.254/latest/meta-data/"],
    ["DNS rebinding hostname", "https://rebind.example.test/"],
    [
      "redirect to loopback",
      "https://public.example.test/r?to=http://127.0.0.1",
    ],
    [
      "page subresource",
      "https://public.example.test/page-with-private-iframe",
    ],
    ["WebSocket", "wss://public.example.test/private-network-tunnel"],
    ["proxy bypass", "http://localhost:3128/"],
    ["alternate protocol", "file:///etc/passwd"],
  ])("fails closed before cache/network access for %s", async (_case, url) => {
    const { createCloakBrowserToolForUser } = await import("./cloak-browser");
    const tool = createCloakBrowserToolForUser("user-1", "thread-1");

    await expect(
      (tool as any).execute({ action: "navigate", url }, {}),
    ).resolves.toMatchObject({
      isError: true,
      error:
        "Browser automation is disabled until network isolation is verified.",
    });

    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(calls.length).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
