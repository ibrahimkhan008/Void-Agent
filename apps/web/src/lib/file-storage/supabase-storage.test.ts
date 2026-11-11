import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const download = vi.fn();
  const getPublicUrl = vi.fn();
  const from = vi.fn(() => ({
    upload,
    createSignedUrl,
    remove,
    download,
    getPublicUrl,
  }));
  return {
    upload,
    createSignedUrl,
    remove,
    download,
    getPublicUrl,
    from,
    createClient: vi.fn(() => ({ storage: { from } })),
    generateUUID: vi.fn(() => "fixed-uuid"),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("lib/utils", () => ({ generateUUID: mocks.generateUUID }));
vi.mock("lib/errors", () => ({
  FileNotFoundError: class FileNotFoundError extends Error {
    constructor(key: string) {
      super(key);
    }
  },
}));

describe("supabase file storage ownership and bounded downloads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("FILE_STORAGE_PREFIX", "uploads");
    mocks.upload.mockResolvedValue({ data: { path: "unused" }, error: null });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://project.supabase.co/storage/signed/object" },
      error: null,
    });
    mocks.download.mockResolvedValue({ data: new Blob(["test"]), error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.test/file" },
    });
  });

  it("stores authenticated uploads under the validated owner prefix", async () => {
    mocks.upload.mockResolvedValueOnce({
      data: { path: "uploads/user-1/fixed-uuid-notes.txt" },
      error: null,
    });
    const { createSupabaseStorage } = await import("./supabase-storage");
    const result = await createSupabaseStorage().upload(Buffer.from("notes"), {
      filename: "notes.txt",
      userId: "user-1",
      ownerId: "user-1",
      uploadType: "attachment",
    });

    expect(mocks.upload).toHaveBeenCalledWith(
      "uploads/user-1/fixed-uuid-notes.txt",
      expect.any(Buffer),
      expect.objectContaining({ upsert: false }),
    );
    expect(result.key).toBe("uploads/user-1/fixed-uuid-notes.txt");
  });

  it("rejects an owner that conflicts with the user path", async () => {
    const { createSupabaseStorage } = await import("./supabase-storage");
    await expect(
      createSupabaseStorage().upload(Buffer.from("data"), {
        filename: "notes.txt",
        userId: "user-1",
        ownerId: "user-2",
      }),
    ).rejects.toThrow("Upload owner does not match");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("limits Supabase downloads while streaming the short-lived signed object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-length": "3" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createSupabaseStorage } = await import("./supabase-storage");
    const result = await createSupabaseStorage().downloadLimited(
      "uploads/user-1/file.bin",
      3,
    );
    expect(result).toEqual(Buffer.from([1, 2, 3]));
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "uploads/user-1/file.bin",
      60,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://project.supabase.co/storage/signed/object").href,
      { cache: "no-store", redirect: "error" },
    );
  });

  it("rejects a signed URL whose origin differs from the configured Supabase origin", async () => {
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://attacker.example/object" },
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createSupabaseStorage } = await import("./supabase-storage");
    await expect(
      createSupabaseStorage().downloadLimited("uploads/user-1/file.bin", 10),
    ).rejects.toThrow("unexpected origin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized Supabase body even when Content-Length is absent", async () => {
    let readCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        readCount += 1;
        if (readCount === 1) controller.enqueue(new Uint8Array([1, 2, 3]));
        else if (readCount === 2) controller.enqueue(new Uint8Array([4, 5, 6]));
        else if (readCount === 3) controller.enqueue(new Uint8Array([7]));
        else controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const { createSupabaseStorage } = await import("./supabase-storage");

    await expect(
      createSupabaseStorage().downloadLimited("uploads/user-1/file.bin", 5),
    ).rejects.toThrow("File exceeds the maximum allowed size");
    // ReadableStream may prefetch one queued chunk beyond the consumer's last
    // read; the reader must cancel instead of draining the remaining source.
    expect(readCount).toBe(3);
  });
});
