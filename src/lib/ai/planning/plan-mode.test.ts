import { describe, expect, it, vi } from "vitest";
import {
  PLAN_MODE_APP_RESEARCH_TOOLS,
  PLAN_MODE_PROJECT_RESEARCH_TOOLS,
  buildPlanModeTools,
  canUsePlanMode,
} from "./plan-mode";

describe("plan mode tool isolation", () => {
  it("rejects Plan mode on models without tool calling while keeping normal chat available", () => {
    expect(canUsePlanMode(true, false)).toBe(false);
    expect(canUsePlanMode(true, true)).toBe(true);
    expect(canUsePlanMode(false, false)).toBe(true);
  });

  it("keeps only allowlisted read-only research tools plus createPlan", () => {
    const tool = (name: string) => ({ description: name }) as never;
    const tools = buildPlanModeTools({
      appTools: {
        webSearch: tool("webSearch"),
        webContent: tool("webContent"),
        "youtube-search": tool("youtube-search"),
        "youtube-transcript": tool("youtube-transcript"),
        "publish-page": tool("publish-page"),
        "python-execution": tool("python-execution"),
        gmail: tool("gmail"),
      },
      projectTools: {
        searchProjectKnowledgeGraph: tool("searchProjectKnowledgeGraph"),
        getProjectStatus: tool("getProjectStatus"),
        readProjectDocument: tool("readProjectDocument"),
        createTabularReview: tool("createTabularReview"),
        proposeProjectDocumentEdits: tool("proposeProjectDocumentEdits"),
      },
      createPlan: tool("createPlan"),
    });

    expect(Object.keys(tools).sort()).toEqual(
      [
        ...PLAN_MODE_APP_RESEARCH_TOOLS,
        ...PLAN_MODE_PROJECT_RESEARCH_TOOLS,
        "createPlan",
      ].sort(),
    );
    expect(tools.createPlan).toBeDefined();
    expect(tools.gmail).toBeUndefined();
    expect(tools["python-execution"]).toBeUndefined();
    expect(tools["createTabularReview"]).toBeUndefined();
    expect(tools.proposeProjectDocumentEdits).toBeUndefined();
  });

  it("does not mutate the source tool registries", () => {
    const appTools = { webSearch: { description: "search" } } as never;
    const projectTools = {
      getProjectStatus: { description: "status" },
    } as never;
    const createPlan = { description: "plan" } as never;

    buildPlanModeTools({ appTools, projectTools, createPlan });

    expect(Object.keys(appTools)).toEqual(["webSearch"]);
    expect(Object.keys(projectTools)).toEqual(["getProjectStatus"]);
    expect(vi.isMockFunction(createPlan)).toBe(false);
  });
});
