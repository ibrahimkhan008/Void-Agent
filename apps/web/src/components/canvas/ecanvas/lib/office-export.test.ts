import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containImage,
  exportImagesAsDocx,
  exportImagesAsPptx,
} from "./office-export";

describe("containImage", () => {
  it("fits a wide image inside a slide without stretching", () => {
    expect(
      containImage({ width: 1920, height: 1080 }, { width: 12, height: 6.5 }),
    ).toEqual({
      width: 11.555555555555555,
      height: 6.5,
      x: 0.22222222222222232,
      y: 0,
    });
  });

  it("centers a portrait image inside a wide page", () => {
    const result = containImage(
      { width: 600, height: 900 },
      { width: 900, height: 500 },
    );
    expect(result.width / result.height).toBeCloseTo(2 / 3);
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBe(0);
  });
});

describe("Office canvas exports", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["PowerPoint", exportImagesAsPptx, "canvas.pptx"],
    ["Word", exportImagesAsDocx, "canvas.docx"],
  ] as const)(
    "creates a downloadable %s file",
    async (_name, exportFile, expectedName) => {
      const anchor = { href: "", download: "", click: vi.fn() };
      vi.stubGlobal(
        "Image",
        class {
          naturalWidth = 1;
          naturalHeight = 1;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) {
            queueMicrotask(() => this.onload?.());
          }
        },
      );
      vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
      vi.stubGlobal("window", {
        setTimeout: vi.fn((callback: () => void) => callback()),
      });
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:canvas-export");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      const created: Blob[] = [];
      vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
        created.push(blob as Blob);
        return "blob:canvas-export";
      });

      const exported = await exportFile(
        [
          {
            base64:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ3sAAAAASUVORK5CYII=",
            label: "Frame 1",
          },
        ],
        "canvas",
      );

      expect(exported).toBe(true);
      expect(created[0]?.size).toBeGreaterThan(0);
      expect(anchor.download).toBe(expectedName);
      expect(anchor.click).toHaveBeenCalledOnce();
    },
  );
});
