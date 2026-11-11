import { describe, expect, it } from "vitest";
import {
  COMMUNITY_MEDIA_MAX_BYTES,
  COMMUNITY_UPLOAD_BODY_MAX_BYTES,
  isValidCommunityMedia,
  readCommunityUploadBody,
  sanitizeCommunityFilename,
} from "./media-validation";

describe("community media validation", () => {
  it("checks image and video signatures instead of trusting MIME labels", () => {
    expect(
      isValidCommunityMedia(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
        8,
      ),
    ).toBe(true);
    expect(isValidCommunityMedia("image/png", new Uint8Array(16), 16)).toBe(
      false,
    );
    expect(isValidCommunityMedia("video/mp4", new Uint8Array(16), 16)).toBe(
      false,
    );
    expect(
      isValidCommunityMedia(
        "video/mp4",
        new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]),
        12,
      ),
    ).toBe(true);
  });

  it("rejects unsupported, empty and oversized media", () => {
    expect(isValidCommunityMedia("image/svg+xml", new Uint8Array(20), 20)).toBe(
      false,
    );
    expect(
      isValidCommunityMedia("image/jpeg", new Uint8Array([255, 216, 255]), 0),
    ).toBe(false);
    expect(
      isValidCommunityMedia(
        "image/jpeg",
        new Uint8Array([255, 216, 255]),
        COMMUNITY_MEDIA_MAX_BYTES + 1,
      ),
    ).toBe(false);
  });

  it("removes path separators and control characters from display filenames", () => {
    expect(sanitizeCommunityFilename("../private\u0000movie.mp4")).toBe(
      ".._private_movie.mp4",
    );
    expect(sanitizeCommunityFilename(" ")).toBe("community-media");
  });

  it("stops reading request streams once the multipart body cap is exceeded", async () => {
    const request = new Request("https://app.test/upload", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(COMMUNITY_UPLOAD_BODY_MAX_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    await expect(readCommunityUploadBody(request)).resolves.toBeNull();
  });
});
