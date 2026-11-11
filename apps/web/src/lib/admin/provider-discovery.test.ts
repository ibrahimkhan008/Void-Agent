import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  httpsRequest: vi.fn(),
  resolvePublicWebhookUrl: vi.fn(),
}));

vi.mock("node:https", () => ({ request: mocks.httpsRequest }));
vi.mock("lib/webhooks/url-guard", () => ({
  resolvePublicWebhookUrl: mocks.resolvePublicWebhookUrl,
  UrlBlockedError: class UrlBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UrlBlockedError";
    }
  },
}));

import { UrlBlockedError } from "lib/webhooks/url-guard";
import {
  PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES,
  PROVIDER_DISCOVERY_TIMEOUT_MS,
  ProviderDiscoveryResponseTooLargeError,
  ProviderDiscoveryTimeoutError,
  requestProviderDiscovery,
} from "./provider-discovery";
import { createProviderDiscoveryRequest } from "./provider-discovery-request";

const safeUrl = new URL("https://provider.example/v1/models");
const publicAddresses = [{ address: "93.184.216.34", family: 4 as const }];

function setupIncomingResponse({
  status = 200,
  headers = { "content-type": "application/json" },
  chunks = [Buffer.from('{"data":[{"id":"model-a"}]}')],
}: {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
} = {}) {
  let incoming: EventEmitter & {
    headers: Record<string, string>;
    statusCode: number;
    statusMessage: string;
    destroy: ReturnType<typeof vi.fn>;
  };
  const request = new EventEmitter() as EventEmitter & {
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  request.destroy = vi.fn();
  request.end = vi.fn(() => {
    incoming = Object.assign(new EventEmitter(), {
      headers,
      statusCode: status,
      statusMessage: status === 302 ? "Found" : "OK",
      destroy: vi.fn(),
    });
    const callback = mocks.httpsRequest.mock.calls.at(-1)?.[2] as (
      value: typeof incoming,
    ) => void;
    callback(incoming);
    queueMicrotask(() => {
      for (const chunk of chunks) incoming.emit("data", chunk);
      incoming.emit("end");
    });
  });
  mocks.httpsRequest.mockReturnValue(request);
  return { request };
}

describe("provider model discovery security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicWebhookUrl.mockResolvedValue({
      url: safeUrl,
      addresses: publicAddresses,
    });
  });

  it("sends provider credentials over a pinned HTTPS request", async () => {
    setupIncomingResponse();
    const response = await requestProviderDiscovery(
      safeUrl.toString(),
      "private-api-key",
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: [{ id: "model-a" }] });
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.httpsRequest.mock.calls[0];
    expect(url).toEqual(safeUrl);
    expect(options.headers).toEqual({
      Authorization: "Bearer private-api-key",
      "api-key": "private-api-key",
    });
    const lookup = options.lookup as (
      hostname: string,
      options: unknown,
      callback: (error: null, address: string, family: number) => void,
    ) => void;
    const resolved: unknown[] = [];
    lookup("provider.example", {}, (...args) => resolved.push(...args));
    expect(resolved).toEqual([null, "93.184.216.34", 4]);
  });

  it("denies private or otherwise blocked targets before opening a socket", async () => {
    mocks.resolvePublicWebhookUrl.mockRejectedValue(
      new UrlBlockedError("Webhook host resolves to a non-public address"),
    );
    await expect(
      requestProviderDiscovery("https://127.0.0.1/latest/meta-data/"),
    ).rejects.toBeInstanceOf(UrlBlockedError);
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("does not follow redirects", async () => {
    setupIncomingResponse({
      status: 302,
      headers: {
        location: "https://internal.example/private",
        "content-length": "0",
      },
      chunks: [],
    });
    const response = await requestProviderDiscovery(safeUrl.toString());
    expect(response.status).toBe(302);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized response bodies before JSON parsing", async () => {
    const { request } = setupIncomingResponse({
      headers: {
        "content-length": String(PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES + 1),
      },
      chunks: [],
    });
    await expect(
      requestProviderDiscovery(safeUrl.toString()),
    ).rejects.toBeInstanceOf(ProviderDiscoveryResponseTooLargeError);
    expect(request.destroy).toHaveBeenCalled();
  });

  it("enforces the response cap when the server omits content length", async () => {
    const { request } = setupIncomingResponse({
      headers: { "content-type": "application/json" },
      chunks: [
        Buffer.alloc(PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES / 2),
        Buffer.alloc(PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES / 2 + 1),
      ],
    });
    await expect(
      requestProviderDiscovery(safeUrl.toString()),
    ).rejects.toBeInstanceOf(ProviderDiscoveryResponseTooLargeError);
    expect(request.destroy).toHaveBeenCalled();
  });

  it("enforces the 10 second request timeout", async () => {
    vi.useFakeTimers();
    const request = new EventEmitter() as EventEmitter & {
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    request.end = vi.fn();
    request.destroy = vi.fn();
    mocks.httpsRequest.mockReturnValue(request);

    try {
      const rejected = expect(
        requestProviderDiscovery(safeUrl.toString()),
      ).rejects.toBeInstanceOf(ProviderDiscoveryTimeoutError);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(PROVIDER_DISCOVERY_TIMEOUT_MS);
      await rejected;
      expect(request.destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createProviderDiscoveryRequest", () => {
  it("sends provider credentials in a POST body, never in the URL", () => {
    const secret = "private-api-key";
    const request = createProviderDiscoveryRequest(
      "https://provider.example/v1",
      secret,
    );

    expect(request.url).toBe("/api/admin/providers/discover");
    expect(request.url).not.toContain(secret);
    expect(request.init.method).toBe("POST");
    expect(request.init.body).toBe(
      JSON.stringify({
        baseURL: "https://provider.example/v1",
        apiKey: secret,
      }),
    );
  });

  it("includes the stable provider ID without sending a saved secret", () => {
    const request = createProviderDiscoveryRequest(
      "https://provider.example/v1",
      "",
      "gateway-one",
    );

    expect(request.init.body).toBe(
      JSON.stringify({
        baseURL: "https://provider.example/v1",
        providerId: "gateway-one",
      }),
    );
  });
});
