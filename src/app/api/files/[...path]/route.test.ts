import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: mocks.download },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  getContentTypeFromFilename: (filename: string) =>
    filename.endsWith(".png") ? "image/png" : "application/octet-stream",
  isUserStorageKey: (key: string, userId: string) =>
    key.startsWith(`uploads/${userId}/`),
  resolveStoragePrefix: () => "uploads",
}));
vi.mock("lib/errors", () => ({
  FileNotFoundError: class FileNotFoundError extends Error {},
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const get = (path: string[]) =>
  GET(new NextRequest("https://void.test/api/files"), {
    params: Promise.resolve({ path }),
  });

describe("GET /api/files/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.download.mockResolvedValue(Buffer.from("image"));
  });

  it("requires the owner session for user-scoped uploads", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const anonymous = await get(["uploads", "user-1", "file.png"]);
    expect(anonymous.status).toBe(401);
    const foreign = await get(["uploads", "user-2", "file.png"]);
    expect(foreign.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("serves an owner file privately and rate limits access", async () => {
    const response = await get(["uploads", "user-1", "file.png"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await get(["uploads", "user-1", "file.png"])).status).toBe(429);
  });

  it("retains public access only for non-owner generated assets and rejects traversal", async () => {
    const generated = await get(["generated", "file.png"]);
    expect(generated.status).toBe(200);
    expect(generated.headers.get("cache-control")).toContain("public");
    expect((await get(["uploads", "user-1", "..", "secret"])).status).toBe(404);
  });
});
