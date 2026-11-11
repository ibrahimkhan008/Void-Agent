import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveMedia: vi.fn(),
  deleteUnattachedMedia: vi.fn(),
  upload: vi.fn(),
  storageDelete: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request: unknown) =>
    handler(request, { user: { id: "owner-1" } }),
}));
vi.mock("lib/community/community-repository.pg", () => ({
  communityRepository: {
    saveMedia: mocks.saveMedia,
    deleteUnattachedMedia: mocks.deleteUnattachedMedia,
  },
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: mocks.upload, delete: mocks.storageDelete },
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

describe("community media upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.storageDelete.mockResolvedValue(undefined);
    mocks.upload.mockResolvedValue({
      key: "private/owner-1/file.png",
      sourceUrl: "https://secret-storage/signed?token=secret",
    });
    mocks.saveMedia.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("persists only owner-scoped private storage metadata and does not return provider URLs or keys", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])],
        "image.png",
        { type: "image/png" },
      ),
    );
    const request = new Request("https://app.test/api/community/media", {
      method: "POST",
      headers: { origin: "https://app.test" },
      body: form,
    });
    const response = await POST(request as never);
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        userId: "owner-1",
        uploadType: "attachment",
        contentType: "image/png",
      }),
    );
    expect(mocks.saveMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        storageKey: "private/owner-1/file.png",
      }),
    );
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain("private/owner-1");
    expect(JSON.stringify(payload)).not.toContain("secret-storage");
    expect(payload.media.url).toContain("/api/community/media/");
  });

  it("rejects mismatched media bytes before storage and cleans up if metadata persistence fails", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(16)], "fake.png", { type: "image/png" }),
    );
    const request = () =>
      new Request("https://app.test/api/community/media", {
        method: "POST",
        headers: { origin: "https://app.test" },
        body: form,
      });
    expect((await POST(request() as never)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();

    const validForm = new FormData();
    validForm.set(
      "file",
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])],
        "valid.png",
        { type: "image/png" },
      ),
    );
    mocks.saveMedia.mockResolvedValue(null);
    const response = await POST(
      new Request("https://app.test/api/community/media", {
        method: "POST",
        headers: { origin: "https://app.test" },
        body: validForm,
      }) as never,
    );
    expect(response.status).toBe(500);
    expect(mocks.storageDelete).toHaveBeenCalledWith(
      "private/owner-1/file.png",
    );
  });
});
