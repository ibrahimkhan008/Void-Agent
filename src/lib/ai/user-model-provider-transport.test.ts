import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  agentCtor: vi.fn(),
  fetch: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("undici", () => ({
  Agent: class {
    options: unknown;
    close = vi.fn(async () => undefined);
    destroy = vi.fn(async () => undefined);
    constructor(options: unknown) {
      this.options = options;
      mocks.agentCtor(options);
    }
  },
  fetch: mocks.fetch,
}));
vi.mock("lib/webhooks/url-guard", () => ({
  resolvePublicWebhookUrl: mocks.resolve,
  UrlBlockedError: class UrlBlockedError extends Error {},
}));

import {
  USER_PROVIDER_MAX_RESPONSE_BYTES,
  fetchUserModelProvider,
  normalizeUserProviderBaseUrl,
  parseOpenAICompatibleModelIds,
} from "./user-model-provider-transport";

describe("user model provider transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({
      url: new URL("https://provider.example/v1/models"),
      addresses: [{ address: "93.184.216.34", family: 4 }],
    });
    mocks.fetch.mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
  });

  it("normalizes only HTTPS port 443 provider URLs", () => {
    expect(normalizeUserProviderBaseUrl("https://provider.example/v1/")).toBe(
      "https://provider.example/v1",
    );
    expect(() =>
      normalizeUserProviderBaseUrl("http://provider.example/v1"),
    ).toThrow();
    expect(() =>
      normalizeUserProviderBaseUrl("https://provider.example:8443/v1"),
    ).toThrow();
    expect(() =>
      normalizeUserProviderBaseUrl("https://user:pass@provider.example/v1"),
    ).toThrow();
  });

  it("validates DNS then uses an address-pinned dispatcher and rejects redirects", async () => {
    const response = await fetchUserModelProvider(
      "https://provider.example/v1/chat/completions",
      { method: "POST", body: "{}" },
    );
    expect(await response.text()).toBe("ok");
    expect(mocks.resolve).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
    );
    const options = mocks.agentCtor.mock.calls[0]?.[0] as {
      connect: {
        lookup: (
          hostname: string,
          options: { all?: boolean },
          callback: (...args: unknown[]) => void,
        ) => void;
      };
      maxRedirections: number;
      headersTimeout: number;
      bodyTimeout: number;
    };
    expect(options.maxRedirections).toBe(0);
    expect(options.headersTimeout).toBeGreaterThan(0);
    expect(options.bodyTimeout).toBeGreaterThan(0);
    const lookup = options.connect.lookup;
    const answer: unknown[] = [];
    lookup("provider.example", {}, (...args: unknown[]) =>
      answer.push(...args),
    );
    expect(answer).toEqual([null, "93.184.216.34", 4]);
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  it("fails closed if DNS validation rejects the destination", async () => {
    mocks.resolve.mockRejectedValue(new Error("blocked"));
    await expect(
      fetchUserModelProvider("https://127.0.0.1/v1/models"),
    ).rejects.toThrow("blocked");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects redirect responses and enforces a bounded total request timeout", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://internal.example/private" },
      }),
    );
    await expect(
      fetchUserModelProvider("https://provider.example/v1/models"),
    ).rejects.toThrow("redirects are not allowed");

    mocks.fetch.mockImplementationOnce(
      (_url: URL, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            {
              once: true,
            },
          );
        }),
    );
    await expect(
      fetchUserModelProvider(
        "https://provider.example/v1/models",
        {},
        USER_PROVIDER_MAX_RESPONSE_BYTES,
        5,
      ),
    ).rejects.toThrow("aborted");
  });

  it("rejects oversized non-string request bodies", async () => {
    const oversized = new Uint8Array(32 * 1024 * 1024 + 1);
    await expect(
      fetchUserModelProvider("https://provider.example/v1/chat/completions", {
        method: "POST",
        body: oversized,
      }),
    ).rejects.toThrow("request exceeded the size limit");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("extracts bounded unique model ids from compatible response shapes", () => {
    expect(
      parseOpenAICompatibleModelIds({
        data: [{ id: "model-a" }, { name: "model-b" }, { id: "model-a" }, null],
      }),
    ).toEqual(["model-a", "model-b"]);
    expect(parseOpenAICompatibleModelIds({ models: ["model-c"] })).toEqual([
      "model-c",
    ]);
    expect(parseOpenAICompatibleModelIds({ other: [] })).toEqual([]);
  });
});
