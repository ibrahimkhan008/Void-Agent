//@vitest-environment node

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  resolvePublicWebhookUrl: vi.fn(),
  agentOptions: null as unknown,
  agentDestroy: vi.fn(),
  responseStatus: 200,
  responseStatusMessage: "OK",
  responseNeverEnds: false,
}));

vi.mock("node:https", () => ({
  Agent: class {
    constructor(options: unknown) {
      mocks.agentOptions = options;
    }

    destroy() {
      mocks.agentDestroy();
    }
  },
  request: mocks.request,
}));
vi.mock("./url-guard", () => ({
  UrlBlockedError: class UrlBlockedError extends Error {},
  resolvePublicWebhookUrl: mocks.resolvePublicWebhookUrl,
}));

import { computeBackoffMs, deliverWebhook } from "./deliver";

const baseInput = {
  url: "https://subscriber.example.com/hook",
  payload: '{"hello":"world"}',
  signature: "0".repeat(64),
  timestamp: "1700000000",
};

const publicAddresses = [
  { address: "93.184.216.34", family: 4 },
  { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
];

describe("deliverWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentOptions = null;
    mocks.responseStatus = 200;
    mocks.responseStatusMessage = "OK";
    mocks.responseNeverEnds = false;
    mocks.resolvePublicWebhookUrl.mockImplementation(async (raw: string) => ({
      url: new URL(raw),
      addresses: publicAddresses,
    }));
    mocks.request.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        onResponse: (response: unknown) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          end: (body: string) => void;
          destroy: (error?: Error) => void;
          body?: string;
        };
        request.end = (body: string) => {
          request.body = body;
          const response = new EventEmitter() as EventEmitter & {
            statusCode: number;
            statusMessage: string;
            resume: () => void;
          };
          response.statusCode = mocks.responseStatus;
          response.statusMessage = mocks.responseStatusMessage;
          response.resume = () => {
            if (!mocks.responseNeverEnds) {
              queueMicrotask(() => response.emit("end"));
            }
          };
          onResponse(response);
        };
        request.destroy = (error = new Error("destroyed")) => {
          request.emit("error", error);
        };
        return request;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns ok:true on 2xx and preserves the signed POST request", async () => {
    const result = await deliverWebhook(baseInput);
    expect(result).toEqual({ ok: true, status: 200 });

    const [url, options] = mocks.request.mock.calls[0] as [
      URL,
      {
        method: string;
        headers: Record<string, string>;
        lookup: unknown;
        agent: unknown;
      },
    ];
    expect(url.href).toBe(baseInput.url);
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Webhook-Signature"]).toContain(
      baseInput.timestamp,
    );
    expect(options.headers["User-Agent"]).toBe("void-agent-webhooks/1");
    expect(options.agent).toBeDefined();
    expect(mocks.agentOptions).toEqual({ lookup: options.lookup });
    expect(mocks.agentDestroy).toHaveBeenCalledOnce();
    expect((mocks.request.mock.results[0].value as { body: string }).body).toBe(
      baseInput.payload,
    );
  });

  it.each([
    [404, "Not Found"],
    [500, "Server Error"],
  ])("returns the HTTP failure status %s", async (status, message) => {
    mocks.responseStatus = status;
    mocks.responseStatusMessage = message;
    expect(await deliverWebhook(baseInput)).toEqual({
      ok: false,
      status,
      error: message,
    });
  });

  it("blocks redirects instead of following a redirect to a private host", async () => {
    mocks.responseStatus = 302;
    mocks.responseStatusMessage = "Found";

    const result = await deliverWebhook(baseInput);

    expect(result).toEqual({
      ok: false,
      status: 302,
      error: "redirect blocked",
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("pins the socket lookup to prevalidated IPs if DNS changes afterward", async () => {
    const result = await deliverWebhook(baseInput);
    expect(result.ok).toBe(true);
    const options = mocks.request.mock.calls[0]?.[1] as {
      lookup: (
        hostname: string,
        options: { all?: boolean },
        callback: (
          error: Error | null,
          address: string | object[],
          family?: number,
        ) => void,
      ) => void;
    };
    const lookup = options.lookup;

    // Simulate the attacker's DNS answer changing to a metadata IP after the
    // guard's public resolution. The socket lookup still returns only the
    // addresses captured by that successful guard check.
    const resultAddress = await new Promise<{
      address: string;
      family: number;
    }>((resolve, reject) => {
      lookup(
        baseInput.url ? new URL(baseInput.url).hostname : "",
        {},
        (error, address, family) => {
          if (error || typeof address !== "string" || family === undefined) {
            reject(error ?? new Error("No pinned address returned"));
            return;
          }
          resolve({ address, family });
        },
      );
    });
    expect(publicAddresses).toContainEqual(resultAddress);

    const allAddresses = await new Promise<object[]>((resolve, reject) => {
      lookup(
        new URL(baseInput.url).hostname,
        { all: true },
        (error, addresses) => {
          if (error || !Array.isArray(addresses)) {
            reject(error ?? new Error("Pinned answer list missing"));
            return;
          }
          resolve(addresses);
        },
      );
    });
    expect(allAddresses).toEqual(publicAddresses);

    const mismatch = await new Promise<Error | null>((resolve) => {
      lookup("169.254.169.254", {}, (error) => resolve(error));
    });
    expect(mismatch).toBeInstanceOf(Error);
  });

  it("returns timeout and destroys an unfinished request", async () => {
    vi.useFakeTimers();
    mocks.responseNeverEnds = true;
    const pending = deliverWebhook({ ...baseInput, timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toEqual({ ok: false, error: "timeout" });
  });
});

describe("computeBackoffMs", () => {
  it("attempt 0 is approximately 1000ms (±20% jitter)", () => {
    for (let index = 0; index < 20; index++) {
      const ms = computeBackoffMs(0);
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(1200);
    }
  });

  it("attempt 5 is approximately 32_000ms (±20% jitter)", () => {
    for (let index = 0; index < 20; index++) {
      const ms = computeBackoffMs(5);
      expect(ms).toBeGreaterThanOrEqual(25_600);
      expect(ms).toBeLessThanOrEqual(38_400);
    }
  });

  it("attempt 12+ is capped at 1 hour (±20% jitter)", () => {
    for (let index = 0; index < 20; index++) {
      for (const attempt of [12, 20]) {
        const ms = computeBackoffMs(attempt);
        expect(ms).toBeGreaterThanOrEqual(2_880_000);
        expect(ms).toBeLessThanOrEqual(4_320_000);
      }
    }
  });

  it("attempt 11 is not yet at the cap (±20%)", () => {
    for (let index = 0; index < 20; index++) {
      const ms = computeBackoffMs(11);
      expect(ms).toBeGreaterThanOrEqual(1_638_400);
      expect(ms).toBeLessThanOrEqual(2_457_600);
    }
  });
});
