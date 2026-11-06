import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  resolvePublicWebhookUrl: vi.fn(),
  httpsRequest: vi.fn(),
}));
vi.mock("lib/db/pg/repositories/http-request-approval-repository.pg", () => ({
  httpRequestApprovalRepository: { consume: mocks.consume },
}));
vi.mock("lib/webhooks/url-guard", () => ({
  resolvePublicWebhookUrl: mocks.resolvePublicWebhookUrl,
}));
vi.mock("node:https", () => ({ request: mocks.httpsRequest }));

import { createHttpFetchTool } from "./fetch";

const input = {
  url: "https://api.example.com/v1/items",
  method: "POST",
  headers: { authorization: "Bearer reviewed" },
  body: "{}",
  timeout: 10_000,
  approvalToken: "one-use-token",
};
let requestOptions: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  requestOptions = {};
  mocks.consume.mockResolvedValue(true);
  mocks.resolvePublicWebhookUrl.mockResolvedValue({
    url: new URL(input.url),
    addresses: [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
  });
  mocks.httpsRequest.mockImplementation(
    (
      _url: URL,
      options: Record<string, unknown>,
      onResponse: (
        response: EventEmitter & {
          statusCode: number;
          statusMessage: string;
          headers: Record<string, string>;
          destroy: () => void;
        },
      ) => void,
    ) => {
      requestOptions = options;
      const request = Object.assign(new EventEmitter(), {
        destroy: vi.fn((error?: Error) => {
          if (error) request.emit("error", error);
          return request;
        }),
        write: vi.fn(),
        end: vi.fn(() => {
          const response = Object.assign(new EventEmitter(), {
            statusCode: 200,
            statusMessage: "OK",
            headers: { "content-type": "application/json" },
            destroy: vi.fn(),
          });
          onResponse(response);
          queueMicrotask(() => {
            response.emit("data", Buffer.from('{"ok":true}'));
            response.emit("end");
            request.emit("close");
          });
        }),
      });
      return request;
    },
  );
});

describe("httpFetchTool", () => {
  it("requires an authenticated user context and never sends from the static tool", async () => {
    const result = await (createHttpFetchTool() as any).execute(input, {});
    expect(result.isError).toBe(true);
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });
  it("does not send requests without an exact unconsumed approval", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await (createHttpFetchTool("user-1") as any).execute(
      input,
      {},
    );
    expect(result.isError).toBe(true);
    expect(mocks.consume).toHaveBeenCalledWith(
      "user-1",
      input.approvalToken,
      expect.objectContaining({ url: input.url, method: "POST" }),
    );
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });
  it("pins the HTTPS connection to an approved public address while retaining the hostname", async () => {
    const result = await (createHttpFetchTool("user-1") as any).execute(
      input,
      {},
    );
    expect(mocks.resolvePublicWebhookUrl).toHaveBeenCalledWith(input.url);
    expect(mocks.httpsRequest).toHaveBeenCalledWith(
      new URL(input.url),
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
    expect(result.body).toEqual({ ok: true });
  });
  it("returns redirects without following their location", async () => {
    mocks.httpsRequest.mockImplementationOnce(
      (
        _url: URL,
        _options: unknown,
        onResponse: (
          response: EventEmitter & {
            statusCode: number;
            statusMessage: string;
            headers: Record<string, string>;
            destroy: () => void;
          },
        ) => void,
      ) => {
        const request = Object.assign(new EventEmitter(), {
          destroy: vi.fn(),
          write: vi.fn(),
          end: vi.fn(() => {
            const response = Object.assign(new EventEmitter(), {
              statusCode: 302,
              statusMessage: "Found",
              headers: { location: "https://127.0.0.1/admin" },
              destroy: vi.fn(),
            });
            onResponse(response);
            queueMicrotask(() => {
              response.emit("end");
              request.emit("close");
            });
          }),
        });
        return request;
      },
    );
    const result = await (createHttpFetchTool("user-1") as any).execute(
      input,
      {},
    );
    expect(result.status).toBe(302);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });
});
