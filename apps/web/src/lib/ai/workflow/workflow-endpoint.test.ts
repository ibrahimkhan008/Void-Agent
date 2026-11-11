import { describe, expect, it } from "vitest";
import { getWorkflowStructureEndpoint } from "./workflow-endpoint";

describe("workflow structure API routing", () => {
  it("routes saved draft graph changes through the owner-scoped saved-workflows API", () => {
    expect(getWorkflowStructureEndpoint("draft-id", true)).toBe(
      "/api/saved-workflows/draft-id/structure",
    );
  });
  it("preserves the existing workflow structure route for standard workflows", () => {
    expect(getWorkflowStructureEndpoint("workflow-id", false)).toBe(
      "/api/workflow/workflow-id/structure",
    );
  });
});
