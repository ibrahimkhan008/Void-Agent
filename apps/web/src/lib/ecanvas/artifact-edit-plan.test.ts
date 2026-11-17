import { describe, expect, it } from "vitest";
import { parseArtifactEditPlan } from "./artifact-edit-plan";

describe("eCanvas targeted edit plan validation", () => {
  it("accepts a bounded plan and normalizes font sizes", () => {
    expect(
      parseArtifactEditPlan(
        JSON.stringify({
          operations: [
            { operation: "set-text", selector: "h1.title", text: "Updated" },
            {
              operation: "set-style",
              selector: ".hero",
              property: "fontSize",
              value: "32",
            },
          ],
        }),
      ),
    ).toEqual([
      { operation: "set-text", selector: "h1.title", text: "Updated" },
      {
        operation: "set-style",
        selector: ".hero",
        property: "fontSize",
        value: "32px",
      },
    ]);
  });

  it("accepts an empty plan as a safe no-op", () => {
    expect(parseArtifactEditPlan('{"operations":[]}')).toEqual([]);
  });

  it("rejects selectors that target document or executable elements", () => {
    for (const selector of [
      "body",
      "main script",
      "iframe.preview",
      "html *",
    ]) {
      expect(
        parseArtifactEditPlan(
          JSON.stringify({
            operations: [{ operation: "remove", selector }],
          }),
        ),
      ).toBeNull();
    }
  });

  it("rejects unsafe styles, unsupported tags, and oversized plans", () => {
    expect(
      parseArtifactEditPlan(
        '{"operations":[{"operation":"set-style","selector":"h1","property":"color","value":"red;position:fixed"}]}',
      ),
    ).toBeNull();
    expect(
      parseArtifactEditPlan(
        '{"operations":[{"operation":"insert-after","selector":"h1","tag":"script","text":"alert(1)"}]}',
      ),
    ).toBeNull();
    expect(
      parseArtifactEditPlan(
        JSON.stringify({
          operations: Array.from({ length: 21 }, () => ({
            operation: "remove",
            selector: ".item",
          })),
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed JSON and oversized text", () => {
    expect(parseArtifactEditPlan("not json")).toBeNull();
    expect(
      parseArtifactEditPlan(
        JSON.stringify({
          operations: [
            {
              operation: "set-text",
              selector: "p",
              text: "x".repeat(4001),
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});
