import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  generateUUID: vi.fn(() => "fixed-uuid-12345678"),
}));

vi.mock("@vercel/blob", () => ({
  del: mocks.del,
  get: mocks.get,
  head: mocks.head,
  put: mocks.put,
}));
vi.mock("lib/utils", () => ({ generateUUID: mocks.generateUUID }));
vi.mock("lib/file-storage/storage-utils", () => ({
  resolveStoragePrefix: () => "uploads",
  validateStorageOwnerId: (id: string) => id,
  sanitizeFilename: (name: string) => name.split(/[/\\]/).pop() ?? "file",
  toBuffer: async (content: unknown) => Buffer.from(content as Uint8Array),
}));

import { createVercelBlobStorage } from "./vercel-blob-storage";

describe("Vercel Blob access mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    delete process.env.VERCEL_BLOB_ACCESS;
    mocks.head.mockResolvedValue({
      url: "https://store.public.blob.vercel-storage.com/uploads/user-1/file.png",
      contentType: "image/png",
      size: 4,
      uploadedAt: new Date("2026-01-01T00:00:00Z"),
    });
    mocks.put.mockResolvedValue({
      pathname: "uploads/user-1/fixed-uuid-12345678-file.png",
      url: "https://store.private.blob.vercel-storage.com/uploads/user-1/fixed-uuid-12345678-file.png",
      contentType: "image/png",
    });
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(Buffer.from("data")).body,
    });
  });

  it("keeps existing stores public by default", async () => {
    await createVercelBlobStorage().upload(Buffer.from("data"), {
      filename: "file.png",
      ownerId: "user-1",
    });

    expect(mocks.put).toHaveBeenCalledWith(
      "uploads/user-1/fixed-uuid-12345678-file.png",
      Buffer.from("data"),
      expect.objectContaining({ access: "public" }),
    );
  });

  it("uploads and retrieves bytes through the private Blob API", async () => {
    process.env.VERCEL_BLOB_ACCESS = "private";
    const storage = createVercelBlobStorage();
    const uploaded = await storage.upload(Buffer.from("data"), {
      filename: "file.png",
      ownerId: "user-1",
      contentType: "image/png",
    });
    const result = await storage.download(uploaded.key);
    await storage.delete(uploaded.key);

    expect(mocks.put).toHaveBeenCalledWith(
      uploaded.key,
      Buffer.from("data"),
      expect.objectContaining({ access: "private", contentType: "image/png" }),
    );
    expect(mocks.get).toHaveBeenCalledWith(uploaded.key, {
      access: "private",
      useCache: false,
    });
    expect(result.toString()).toBe("data");
    expect(mocks.del).toHaveBeenCalledWith(uploaded.key);
  });

  it("rejects an invalid configured access mode", async () => {
    process.env.VERCEL_BLOB_ACCESS = "semi-private";

    await expect(
      createVercelBlobStorage().upload(Buffer.from("data"), { filename: "x" }),
    ).rejects.toThrow(
      "VERCEL_BLOB_ACCESS must be either 'public' or 'private'",
    );
  });

  it("rejects oversized blobs from HEAD metadata before opening their body", async () => {
    process.env.VERCEL_BLOB_ACCESS = "private";
    mocks.head.mockResolvedValueOnce({
      url: "https://store.private.blob.vercel-storage.com/uploads/user-1/large.bin",
      contentType: "application/octet-stream",
      size: 6,
    });

    await expect(
      createVercelBlobStorage().downloadLimited("uploads/user-1/large.bin", 5),
    ).rejects.toThrow("File exceeds the maximum allowed size");
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
