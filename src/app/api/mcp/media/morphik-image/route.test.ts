import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  fetch: vi.fn(),
  resolveReference: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/ai/user-model-provider-transport", () => ({
  fetchUserModelProvider: mocks.fetch,
}));
vi.mock("lib/ai/mcp/morphik-media-reference", () => ({
  resolveMorphikImageReference: mocks.resolveReference,
}));
import { POST } from "./route";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
]);
function request(url: string, body = JSON.stringify({ url })) {
  return new Request("https://app.example/api/mcp/media/morphik-image", {
    method: "POST",
    headers: {
      origin: "https://app.example",
      "content-type": "application/json",
    },
    body,
  });
}

describe("POST /api/mcp/media/morphik-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.resolveReference.mockReturnValue(
      "https://morphik-storage.s3.amazonaws.com/a?signature=opaque",
    );
    mocks.fetch.mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(png.length),
        },
      }),
    );
  });

  it("requires same origin and authentication, then returns private no-store raster bytes", async () => {
    const badOrigin = request("https://s3.amazonaws.com/a");
    badOrigin.headers.set("origin", "https://evil.example");
    expect((await POST(badOrigin)).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request("https://s3.amazonaws.com/a"))).status).toBe(
      401,
    );
    const response = await POST(request("https://s3.amazonaws.com/a"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://s3.amazonaws.com/a",
      expect.anything(),
      512 * 1024,
      5000,
    );
  });

  it("rejects unapproved hosts before any outbound fetch", async () => {
    const response = await POST(
      request("https://s3.amazonaws.com.attacker.test/a"),
    );
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("resolves an authenticated opaque reference before fetching the S3 image", async () => {
    const response = await POST(
      request("", JSON.stringify({ ref: "encrypted-owner-bound-ref" })),
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveReference).toHaveBeenCalledWith(
      "encrypted-owner-bound-ref",
      "u1",
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://morphik-storage.s3.amazonaws.com/a?signature=opaque",
      expect.anything(),
      512 * 1024,
      5000,
    );
  });

  it("fails closed on transport redirect errors, oversized responses, and signature mismatch", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("redirects are not allowed"));
    expect((await POST(request("https://s3.amazonaws.com/a"))).status).toBe(
      502,
    );
    mocks.fetch.mockResolvedValueOnce(
      new Response(new Uint8Array(512 * 1024 + 1), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    expect((await POST(request("https://s3.amazonaws.com/a"))).status).toBe(
      413,
    );
    mocks.fetch.mockResolvedValueOnce(
      new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );
    expect((await POST(request("https://s3.amazonaws.com/a"))).status).toBe(
      415,
    );
  });

  it("rejects malformed or oversized request bodies", async () => {
    expect((await POST(request("", "not json"))).status).toBe(400);
    const large = JSON.stringify({
      url: "https://s3.amazonaws.com/a",
      extra: "x".repeat(9000),
    });
    expect((await POST(request("", large))).status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
