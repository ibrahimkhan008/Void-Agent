import { describe, expect, it } from "vitest";
import {
  parseArtifactElementSelection,
  parseEditedArtifact,
} from "./artifact-editor-protocol";

describe("eCanvas artifact editor message validation", () => {
  it("accepts a bounded text selection and preserves the text-edit capability", () => {
    expect(
      parseArtifactElementSelection({
        id: "element-1",
        text: "Headline",
        canEditText: true,
        color: "#112233",
        backgroundColor: "#ffffff",
        fontSize: 24,
      }),
    ).toEqual({
      id: "element-1",
      text: "Headline",
      canEditText: true,
      color: "#112233",
      backgroundColor: "#ffffff",
      fontSize: 24,
    });
  });

  it("rejects malformed selections and unsafe style values", () => {
    expect(parseArtifactElementSelection(null)).toBeNull();
    expect(
      parseArtifactElementSelection({
        id: "element-1",
        text: "x",
        canEditText: true,
        color: "red;position:fixed",
        backgroundColor: "#ffffff",
        fontSize: 20,
      }),
    ).toBeNull();
  });

  it("accepts only string artifacts within the content API byte limit", () => {
    expect(parseEditedArtifact("<h1>Saved</h1>")).toBe("<h1>Saved</h1>");
    expect(parseEditedArtifact({ html: "no" })).toBeNull();
    expect(parseEditedArtifact("x".repeat(512 * 1024 + 1))).toBeNull();
  });
});
