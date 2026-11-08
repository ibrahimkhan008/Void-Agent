import { describe, expect, it } from "vitest";
import { inferImageToolMode } from "./image-mode";

describe("inferImageToolMode", () => {
  it("keeps edits on a single source when the latest turn has multiple images", () => {
    expect(
      inferImageToolMode(
        undefined,
        "Edit image 1 and remove the background",
        true,
      ),
    ).toBe("edit");
    expect(
      inferImageToolMode(undefined, "Make the first image brighter", true),
    ).toBe("edit");
  });

  it("selects composition only for explicit multi-image composition intent", () => {
    expect(
      inferImageToolMode(
        undefined,
        "Combine these images into one scene",
        true,
      ),
    ).toBe("composite");
    expect(inferImageToolMode(undefined, "Edit image 1", true)).toBe("edit");
    expect(inferImageToolMode(undefined, "Create a new landscape", true)).toBe(
      "create",
    );
  });

  it("honors an explicit mode", () => {
    expect(inferImageToolMode("composite", "Edit one image", true)).toBe(
      "composite",
    );
  });
});
