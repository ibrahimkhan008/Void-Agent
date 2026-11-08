import { describe, expect, it } from "vitest";
import {
  inspectRasterImage,
  parseMorphikImagePreviews,
  sanitizeMorphikText,
  validateMorphikImageUrl,
} from "./morphik-media";

describe("Morphik media safety", () => {
  it("accepts only exact approved HTTPS S3 hosts on 443", () => {
    expect(
      validateMorphikImageUrl(
        "https://morphik-storage.s3.amazonaws.com/a?X-Amz-Signature=x",
      ),
    ).not.toBeNull();
    expect(
      validateMorphikImageUrl("https://s3.amazonaws.com/bucket/a.png"),
    ).not.toBeNull();
    for (const url of [
      "http://s3.amazonaws.com/image.png",
      "https://s3.amazonaws.com.evil.test/image.png",
      "https://evil-s3.amazonaws.com/image.png",
      "https://user@s3.amazonaws.com/image.png",
      "https://s3.amazonaws.com:8443/image.png",
      "https://127.0.0.1/image.png",
    ])
      expect(validateMorphikImageUrl(url)).toBeNull();
  });

  it("bounds and sanitizes metadata and redacts signed URLs and preview payloads", () => {
    const signed =
      "https://s3.amazonaws.com/bucket/image.png?X-Amz-Signature=secret";
    const raw = `<img src=x onerror=alert(1)>`;
    const result = {
      content: [
        {
          type: "text",
          text: `[IMAGE_URL]${signed}[/IMAGE_URL][TITLE]${raw}[/TITLE][SCORE]2[/SCORE][PREVIEW]secretbase64[/PREVIEW]`,
        },
      ],
    };
    const previews = parseMorphikImagePreviews(result);
    expect(previews).toEqual([{ url: signed, title: raw, score: 1 }]);
    const clean = sanitizeMorphikText(result.content[0]!.text);
    expect(clean).not.toContain("X-Amz-Signature");
    expect(clean).not.toContain("secretbase64");
    expect(clean).toContain(raw);
    expect(
      parseMorphikImagePreviews({
        content: [{ type: "text", text: `[IMAGE_URL]${signed}[/IMAGE_URL]` }],
      }),
    ).toHaveLength(1);
    expect(
      parseMorphikImagePreviews({
        content: [
          { type: "text", text: `[IMAGE_URL]${signed}[/IMAGE_URL]`.repeat(9) },
        ],
      }),
    ).toHaveLength(8);
    expect(
      parseMorphikImagePreviews({
        content: [{ type: "text", text: "x".repeat(70_000) }],
      }),
    ).toHaveLength(0);
  });

  it("requires a matching raster signature and declared content type", () => {
    expect(
      inspectRasterImage(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png",
      ),
    ).toBe("image/png");
    expect(
      inspectRasterImage(
        new TextEncoder().encode("<svg></svg>"),
        "image/svg+xml",
      ),
    ).toBeNull();
    expect(
      inspectRasterImage(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/jpeg",
      ),
    ).toBeNull();
  });

  it("renders an opaque reference without exposing its value in transcript JSON", () => {
    const result = {
      content: [
        {
          type: "text",
          text: "[IMAGE_REF]opaque-user-bound-reference[/IMAGE_REF][TITLE]Chart[/TITLE]",
        },
      ],
    };
    expect(parseMorphikImagePreviews(result)).toEqual([
      { previewRef: "opaque-user-bound-reference", title: "Chart" },
    ]);
    const safe = sanitizeMorphikText(result.content[0]!.text);
    expect(safe).not.toContain("opaque-user-bound-reference");
    expect(safe).toContain("Morphik media preview");
  });
});
