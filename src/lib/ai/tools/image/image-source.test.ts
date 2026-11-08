import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  downloadLimited: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/file-storage", () => ({ serverFileStorage: storage }));

import {
  extractGeneratedImageReference,
  findLatestImageReference,
  findLatestUserImageReferences,
  loadOwnedImageForEdit,
  loadOwnedImageReferencesForEdit,
} from "./image-source";

const owner = "user-123";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

describe("image source resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getMetadata.mockResolvedValue({
      key: "uploads/user-123/image.png",
      filename: "image.png",
      contentType: "image/png",
      size: png.byteLength,
    });
    storage.downloadLimited.mockResolvedValue(png);
  });

  it("accepts only bounded inline raster data and sniffs the actual format", async () => {
    const result = await loadOwnedImageForEdit(
      {
        url: `data:image/png;base64,${png.toString("base64")}`,
        mimeType: "image/png",
      },
      undefined,
    );
    expect(result).toEqual({
      base64: png.toString("base64"),
      mimeType: "image/png",
    });
    expect(storage.downloadLimited).not.toHaveBeenCalled();
  });

  it("rejects SVG, malformed inline data, and external URLs without fetching", async () => {
    await expect(
      loadOwnedImageForEdit(
        {
          url: "data:image/svg+xml;base64,PHN2Zz4=",
          mimeType: "image/svg+xml",
        },
        owner,
      ),
    ).rejects.toThrow();
    await expect(
      loadOwnedImageForEdit(
        { url: "https://attacker.example/private.png", mimeType: "image/png" },
        owner,
      ),
    ).rejects.toThrow("Please use an image uploaded to this account.");
    await expect(
      loadOwnedImageForEdit(
        { url: "data:image/png;base64,%%%%", mimeType: "image/png" },
        owner,
      ),
    ).rejects.toThrow();
    expect(storage.getMetadata).not.toHaveBeenCalled();
    expect(storage.downloadLimited).not.toHaveBeenCalled();
  });

  it("downloads only an owned managed key with the storage byte limit", async () => {
    const result = await loadOwnedImageForEdit(
      {
        url: "/api/files/uploads/user-123/image.png",
        mimeType: "image/png",
      },
      owner,
    );
    expect(result.mimeType).toBe("image/png");
    expect(storage.getMetadata).toHaveBeenCalledWith(
      "uploads/user-123/image.png",
    );
    expect(storage.downloadLimited).toHaveBeenCalledWith(
      "uploads/user-123/image.png",
      15 * 1024 * 1024,
    );
  });

  it("rejects another user's managed key before storage reads", async () => {
    await expect(
      loadOwnedImageForEdit(
        {
          url: "/api/files/uploads/other-user/private.png",
          mimeType: "image/png",
        },
        owner,
      ),
    ).rejects.toThrow("Please use an image uploaded to this account.");
    expect(storage.getMetadata).not.toHaveBeenCalled();
    expect(storage.downloadLimited).not.toHaveBeenCalled();
  });

  it("rejects oversized or non-raster stored content", async () => {
    storage.getMetadata.mockResolvedValueOnce({ size: 15 * 1024 * 1024 + 1 });
    await expect(
      loadOwnedImageForEdit(
        {
          url: "/api/files/uploads/user-123/large.png",
          mimeType: "image/png",
        },
        owner,
      ),
    ).rejects.toThrow("15 MiB");
    expect(storage.downloadLimited).not.toHaveBeenCalled();

    storage.getMetadata.mockResolvedValueOnce({ size: 3 });
    storage.downloadLimited.mockResolvedValueOnce(Buffer.from("<svg"));
    await expect(
      loadOwnedImageForEdit(
        {
          url: "/api/files/uploads/user-123/image.svg",
          mimeType: "image/png",
        },
        owner,
      ),
    ).rejects.toThrow("Only PNG, JPEG, WebP, and GIF images can be edited.");
  });

  it("loads multiple images only under the shared byte budget", async () => {
    storage.getMetadata
      .mockResolvedValueOnce({ size: 10 * 1024 * 1024 })
      .mockResolvedValueOnce({ size: 6 * 1024 * 1024 });
    storage.downloadLimited.mockResolvedValueOnce(
      Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 - png.length)]),
    );

    await expect(
      loadOwnedImageReferencesForEdit(
        [
          { url: "/api/files/uploads/user-123/one.png", mimeType: "image/png" },
          { url: "/api/files/uploads/user-123/two.png", mimeType: "image/png" },
        ],
        owner,
      ),
    ).rejects.toThrow("15 MiB");

    expect(storage.downloadLimited).toHaveBeenCalledTimes(1);
    expect(storage.downloadLimited).toHaveBeenCalledWith(
      "uploads/user-123/one.png",
      15 * 1024 * 1024,
    );
  });

  it("caps image count and requires an authenticated owner", async () => {
    const refs = Array.from({ length: 5 }, (_, index) => ({
      url: `/api/files/uploads/user-123/${index}.png`,
      mimeType: "image/png",
    }));
    await expect(loadOwnedImageReferencesForEdit(refs, owner)).rejects.toThrow(
      "2 to 4",
    );
    await expect(
      loadOwnedImageReferencesForEdit(refs.slice(0, 2), undefined),
    ).rejects.toThrow("2 to 4");
    expect(storage.getMetadata).not.toHaveBeenCalled();
  });
});

describe("image history source selection", () => {
  it("selects only distinct bounded images from the latest user turn", () => {
    expect(
      findLatestUserImageReferences([
        {
          role: "user",
          content: [{ type: "file", mediaType: "image/png", url: "/old.png" }],
        },
        {
          role: "user",
          content: [
            { type: "file", mediaType: "image/png", url: "/one.png" },
            { type: "file", mediaType: "image/jpeg", url: "/two.jpg" },
            { type: "file", mediaType: "image/png", url: "/one.png" },
            { type: "file", mediaType: "image/webp", url: "/three.webp" },
            { type: "file", mediaType: "image/gif", url: "/four.gif" },
            { type: "file", mediaType: "image/png", url: "/ignored.png" },
          ],
        },
      ]),
    ).toEqual([
      { url: "/one.png", mimeType: "image/png" },
      { url: "/two.jpg", mimeType: "image/jpeg" },
      { url: "/three.webp", mimeType: "image/webp" },
      { url: "/four.gif", mimeType: "image/gif" },
    ]);
  });

  it("uses the latest generated image result when the user asks for an edit", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "image-manager",
            output: {
              images: [
                { url: "/old.png", mimeType: "image/png" },
                {
                  url: "/api/files/uploads/user-123/new.png",
                  mimeType: "image/png",
                },
              ],
            },
          },
        ],
      },
      { role: "user", content: "Make the sky blue" },
    ];
    expect(findLatestImageReference(messages, "image-manager")).toEqual({
      url: "/api/files/uploads/user-123/new.png",
      mimeType: "image/png",
    });
  });

  it("prefers a newer uploaded image and ignores other tool outputs", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "webSearch",
            output: { images: [{ url: "https://untrusted.example/a.png" }] },
          },
          {
            type: "tool-result",
            toolName: "image-manager",
            output: {
              images: [
                {
                  url: "/api/files/uploads/user-123/old.png",
                  mimeType: "image/png",
                },
              ],
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "image/jpeg",
            url: "/api/files/uploads/user-123/new.jpg",
          },
          { type: "text", text: "Edit this" },
        ],
      },
    ];
    expect(findLatestImageReference(messages, "image-manager")).toEqual({
      url: "/api/files/uploads/user-123/new.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("normalizes SDK wrapped tool output", () => {
    expect(
      extractGeneratedImageReference({
        output: {
          value: { images: [{ url: "/generated.png", mimeType: "image/png" }] },
        },
      }),
    ).toEqual({ url: "/generated.png", mimeType: "image/png" });
  });
});
