import { describe, expect, it } from "vitest";
import { getHitlToolNames, isHitlTool, loadHitlTools } from "./load-hitl-tools";

describe("workflow approval HITL registration", () => {
  it("registers the review proposal as a hidden HITL tool", () => {
    const tools = loadHitlTools("user-1");
    expect(tools.proposeWorkflowRun).toBeDefined();
    expect(getHitlToolNames()).toContain("proposeWorkflowRun");
    expect(isHitlTool("proposeWorkflowRun")).toBe(true);
  });
});
