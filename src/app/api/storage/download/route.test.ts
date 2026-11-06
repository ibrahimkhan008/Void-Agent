import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
  getDownloadUrl: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: {
    download: mocks.download,
    getDownloadUrl: mocks.getDownloadUrl,
  },
  storageDriver: "local",
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  getContentTypeFromFilename: (filename: string) =>
    filename.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
  isUserStorageKey: (key: string, userId: string) =>
    key.startsWith(`uploads/${userId}/`),
  sanitizeFilename: (filename: string) =>
    filename.replace(/[^a-zA-Z0-9._-]/g, "_"),
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
vi.mock("lib/errors", () => ({
  FileNotFoundError: class FileNotFoundError extends Error {},
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const request = (query: string) =>
  new Request(`https://void.test/api/storage/download?${query}`);

describe("GET /api/storage/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.download.mockResolvedValue(Buffer.from("file"));
  });

  it("requires authentication and denies other users before storage access", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request("key=uploads%2Fuser-1%2Ffile.pdf"))).status).toBe(
      401,
    );
    expect((await GET(request("key=uploads%2Fuser-2%2Ffile.pdf"))).status).toBe(
      404,
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("serves an owned file with private headers and safe disposition", async () => {
    const response = await GET(
      request("key=uploads%2Fuser-1%2Ffile.pdf&disposition=inline"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="file.pdf"',
    );
    expect(await response.text()).toBe("file");
  });

  it("forces untrusted formats to attachment and rate limits downloads", async () => {
    const response = await GET(
      request("key=uploads%2Fuser-1%2Ffile.html&disposition=inline"),
    );
    expect(response.headers.get("content-disposition")).toContain("attachment");
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request("key=uploads%2Fuser-1%2Ffile.pdf"))).status).toBe(
      429,
    );
  });
});
