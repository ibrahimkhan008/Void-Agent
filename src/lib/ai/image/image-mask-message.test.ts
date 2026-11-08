import { describe, expect, it } from "vitest";
import { createImageMaskMessagePart } from "./image-mask-message";

describe("createImageMaskMessagePart", () => {
  it("serializes the exact uploaded source/mask association", () => {
    expect(
      createImageMaskMessagePart({
        sourceFileId: "source-1",
        maskFileId: "mask-1",
        sourceUrl: "/api/storage/download?key=source",
        maskUrl: "/api/storage/download?key=mask",
      }),
    ).toEqual({
      type: "data-image-mask",
      data: {
        sourceFileId: "source-1",
        maskFileId: "mask-1",
        sourceUrl: "/api/storage/download?key=source",
        maskUrl: "/api/storage/download?key=mask",
      },
    });
  });

  it("rejects missing or self-paired attachments", () => {
    expect(() =>
      createImageMaskMessagePart({
        sourceFileId: "same",
        maskFileId: "same",
        sourceUrl: "/source",
        maskUrl: "/mask",
      }),
    ).toThrow("exact source image");
  });
});
