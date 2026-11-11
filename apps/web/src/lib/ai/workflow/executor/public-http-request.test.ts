import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePublicWebhookUrl: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("lib/webhooks/url-guard", () => ({
  resolvePublicWebhookUrl: mocks.resolvePublicWebhookUrl,
}));
vi.mock("node:https", () => ({ request: mocks.httpsRequest }));

import { requestPublicWorkflowHttp } from "./public-http-request";

const rawUrl = "https://api.example.com/v1/items";
let requestOptions: Record<string, unknown>;

function mockResponse(statusCode = 200, body = '{"ok":true}') {
  mocks.httpsRequest.mockImplementationOnce(
    (
      _url: URL,
      options: Record<string, unknown>,
      onResponse: (response: EventEmitter & Record<string, any>) => void,
    ) => {
      requestOptions = options;
      const request = Object.assign(new EventEmitter(), {
        setTimeout: vi.fn(),
        write: vi.fn(),
        destroy: vi.fn((error?: Error) => {
          if (error) request.emit("error", error);
          return request;
        }),
        end: vi.fn(() => {
          const response = Object.assign(new EventEmitter(), {
            statusCode,
            statusMessage: statusCode === 200 ? "OK" : "Found",
            headers: {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(body)),
            },
            destroy: vi.fn((error?: Error) => {
              if (error) response.emit("error", error);
              return response;
            }),
          });
          onResponse(response);
          queueMicrotask(() => {
            if (body) response.emit("data", Buffer.from(body));
            response.emit("end");
          });
        }),
      });
      return request;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestOptions = {};
  mocks.resolvePublicWebhookUrl.mockResolvedValue({
    url: new URL(rawUrl),
    addresses: [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
  });
});

describe("requestPublicWorkflowHttp", () => {
  it("pins the validated public address and retains hostname TLS identity", async () => {
    mockResponse();
    const result = await requestPublicWorkflowHttp({
      url: rawUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      timeoutMs: 10_000,
    });

    expect(mocks.resolvePublicWebhookUrl).toHaveBeenCalledWith(rawUrl);
    expect(mocks.httpsRequest).toHaveBeenCalledWith(
      new URL(rawUrl),
      expect.objectContaining({ method: "POST" }),
      expect.any(Function),
    );
    const lookup = requestOptions.lookup as (
      hostname: string,
      options: unknown,
      callback: (error: null, address: string, family: number) => void,
    ) => void;
    const resolved: unknown[] = [];
    lookup("api.example.com", {}, (...args) => resolved.push(...args));
    expect(resolved).toEqual([null, "93.184.216.34", 4]);
    expect(result).toMatchObject({
      status: 200,
      body: '{"ok":true}',
      headers: { "content-type": "application/json" },
      size: 11,
    });
  });

  it("does not connect when any resolved address is private", async () => {
    mocks.resolvePublicWebhookUrl.mockRejectedValueOnce(
      new Error("Webhook host resolves to a non-public address"),
    );
    await expect(
      requestPublicWorkflowHttp({
        url: rawUrl,
        method: "GET",
        headers: {},
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow("non-public address");
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects redirects instead of following the location", async () => {
    mockResponse(302, "");
    await expect(
      requestPublicWorkflowHttp({
        url: rawUrl,
        method: "GET",
        headers: {},
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow("redirects are not followed");
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("caps response bytes and bounds the timeout", async () => {
    const request = new EventEmitter();
    let onResponse:
      | ((response: EventEmitter & Record<string, any>) => void)
      | undefined;
    const destroy = vi.fn((error?: Error) => {
      if (error) request.emit("error", error);
      return request;
    });
    mocks.httpsRequest.mockImplementationOnce(
      (
        _url: URL,
        _options: Record<string, unknown>,
        callback: (response: EventEmitter & Record<string, any>) => void,
      ) => {
        onResponse = callback;
        return Object.assign(request, {
          setTimeout: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
          destroy,
        });
      },
    );
    const pending = requestPublicWorkflowHttp({
      url: rawUrl,
      method: "GET",
      headers: {},
      timeoutMs: 999_999,
    });
    await vi.waitFor(() => expect(onResponse).toBeTypeOf("function"));
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      statusMessage: "OK",
      headers: {},
      destroy: vi.fn((error?: Error) => {
        if (error) response.emit("error", error);
        return response;
      }),
    });
    onResponse?.(response);
    response.emit("data", Buffer.alloc(1_000_001));
    await expect(pending).rejects.toThrow("1 MB limit");
    const setTimeout = (
      mocks.httpsRequest.mock.results[0]?.value as {
        setTimeout: ReturnType<typeof vi.fn>;
      }
    ).setTimeout;
    expect(setTimeout).toHaveBeenCalledWith(300_000, expect.any(Function));
    expect(response.destroy).toHaveBeenCalled();
  });
});
