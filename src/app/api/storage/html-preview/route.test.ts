import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
  getMetadata: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: {
    download: mocks.download,
    getMetadata: mocks.getMetadata,
  },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  isUserStorageKey: (key: string, userId: string) =>
    key.startsWith(`uploads/${userId}/`),
  storageKeyFromUrl: (url: string) => {
    try {
      return new URL(url).pathname
        .replace(/^\/api\/files\//, "")
        .replace(/^\//, "");
    } catch {
      return null;
    }
  },
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { SANDBOX_HTML_PREVIEW_CSP } from "lib/file-ingest/sandbox-html-preview";
import { MAX_SANDBOX_ARTIFACT_BYTES } from "lib/sandbox/artifact-export";
import { GET } from "./route";

const request = (key: string) =>
  new Request(
    `https://void.test/api/storage/html-preview?key=${encodeURIComponent(key)}`,
  );

describe("GET /api/storage/html-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    const content = Buffer.from(
      '<script>parent.location="https://evil.example"</script><a href="https://evil.example">leave</a><p>safe</p>',
    );
    mocks.getMetadata.mockResolvedValue({ size: content.byteLength });
    mocks.download.mockResolvedValue(content);
  });

  it("requires authentication and applies per-user rate limiting", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request("uploads/user-1/page.html"))).status).toBe(401);
    expect(mocks.getMetadata).not.toHaveBeenCalled();

    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request("uploads/user-1/page.html"))).status).toBe(429);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rejects non-HTML files before reading storage", async () => {
    expect((await GET(request("uploads/user-1/page.txt"))).status).toBe(400);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("serves only sanitized owner files with a private sandbox policy", async () => {
    const response = await GET(
      request("uploads/user-1/00000000-0000-4000-8000-000000000001-app.html"),
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("safe");
    expect(html).not.toMatch(/<script|href=|evil\.example/i);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toBe(
      SANDBOX_HTML_PREVIEW_CSP,
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox;",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejects foreign files before storage access", async () => {
    const response = await GET(request("uploads/user-2/file.html"));
    expect(response.status).toBe(404);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("enforces the artifact byte limit before downloading", async () => {
    mocks.getMetadata.mockResolvedValueOnce({
      size: MAX_SANDBOX_ARTIFACT_BYTES + 1,
    });
    const response = await GET(request("uploads/user-1/large.html"));
    expect(response.status).toBe(413);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rejects files that change size between metadata and download", async () => {
    mocks.download.mockResolvedValueOnce(Buffer.from("different length"));
    const response = await GET(request("uploads/user-1/changed.html"));
    expect(response.status).toBe(409);
  });
});
