//@vitest-environment node

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePublicWebhookUrl: vi.fn(),
  request: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("@/lib/webhooks/url-guard", () => ({
  resolvePublicWebhookUrl: mocks.resolvePublicWebhookUrl,
}));

import { downloadPublicTextUrl } from "./secure-url-ingest";

class FakeResponse extends EventEmitter {
  headers: Record<string, string>;
  statusCode: number;
  resumed = false;
  constructor(
    statusCode: number,
    contentType: string,
    private readonly body = "",
  ) {
    super();
    this.statusCode = statusCode;
    this.headers = {
      "content-type": contentType,
      "content-length": String(Buffer.byteLength(body)),
    };
  }
  resume() {
    this.resumed = true;
  }
  destroy(error?: Error) {
    if (error) this.emit("error", error);
  }
  send() {
    if (this.body) this.emit("data", Buffer.from(this.body));
    this.emit("end");
  }
}

function installResponse(
  status: number,
  contentType = "text/plain",
  body = "safe text",
) {
  let latestResponse: FakeResponse | undefined;
  mocks.request.mockImplementation(
    (
      _url: unknown,
      _options: unknown,
      callback: (response: FakeResponse) => void,
    ) => {
      const request = Object.assign(new EventEmitter(), {
        setTimeout: vi.fn(),
        end: () => {
          latestResponse = new FakeResponse(status, contentType, body);
          callback(latestResponse);
          latestResponse.send();
        },
      });
      return request;
    },
  );
  return () => latestResponse;
}

describe("secure collection URL ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicWebhookUrl.mockResolvedValue({
      url: new URL("https://docs.example.test/page"),
      addresses: [{ address: "93.184.216.34", family: 4 }],
    });
  });

  it("pins the HTTPS connection to validated public DNS and extracts text", async () => {
    installResponse(200, "text/plain", "hello <world>");
    const result = await downloadPublicTextUrl(
      "https://docs.example.test/page",
    );
    expect(result).toEqual({
      text: "hello <world>",
      sourceOrigin: "https://docs.example.test",
    });
    const options = mocks.request.mock.calls[0]?.[1] as {
      lookup: (...args: unknown[]) => void;
      method: string;
    };
    expect(options.method).toBe("GET");
    const callback = vi.fn();
    options.lookup("docs.example.test", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const mismatchedHost = vi.fn();
    options.lookup("metadata.internal", {}, mismatchedHost);
    expect(mismatchedHost.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("refuses private-address DNS results before making any network request", async () => {
    const blocked = Object.assign(new Error("non-public address"), {
      name: "UrlBlockedError",
    });
    mocks.resolvePublicWebhookUrl.mockRejectedValue(blocked);
    await expect(
      downloadPublicTextUrl("https://docs.example.test/page"),
    ).rejects.toThrow("non-public");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects redirects without following the Location target", async () => {
    const lastResponse = installResponse(302, "text/html", "");
    await expect(
      downloadPublicTextUrl("https://docs.example.test/page"),
    ).rejects.toThrow(/redirects are not allowed/i);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(lastResponse()?.resumed).toBe(true);
  });

  it("rejects oversized content, unsupported media, and non-standard ports", async () => {
    installResponse(200, "application/octet-stream", "binary");
    await expect(
      downloadPublicTextUrl("https://docs.example.test/page"),
    ).rejects.toThrow(/HTML or plain text/i);
    installResponse(200, "text/plain", "x".repeat(2 * 1024 * 1024 + 1));
    await expect(
      downloadPublicTextUrl("https://docs.example.test/page"),
    ).rejects.toThrow(/too large/i);
    mocks.resolvePublicWebhookUrl.mockResolvedValueOnce({
      url: new URL("https://docs.example.test:8443/page"),
      addresses: [{ address: "93.184.216.34", family: 4 }],
    });
    await expect(
      downloadPublicTextUrl("https://docs.example.test:8443/page"),
    ).rejects.toThrow(/standard HTTPS port/i);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
