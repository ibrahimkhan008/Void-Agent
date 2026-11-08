import { describe, expect, it } from "vitest";
import { getAvailableDefaultVoiceTools } from "./index";

describe("project-scoped voice tool availability", () => {
  it("exposes status lookup broadly but knowledge search only for a project thread with an executor", () => {
    const available = getAvailableDefaultVoiceTools({
      projectThreadAvailable: true,
    });
    expect(available.map((tool) => tool.name)).toContain("runAgent");
    expect(available.map((tool) => tool.name)).toContain("searchWeb");
    expect(
      available.find((tool) => tool.name === "searchWeb")?.description,
    ).toContain("cannot open or change websites");
    expect(
      available.find((tool) => tool.name === "runAgent")?.description,
    ).toContain("cannot call tools");
    expect(available.map((tool) => tool.name)).toContain("getProjectStatus");
    expect(
      available.find((tool) => tool.name === "getProjectStatus")?.description,
    ).toContain("untrusted evidence");
    expect(available.map((tool) => tool.name)).toContain(
      "searchProjectKnowledge",
    );
    expect(
      available.find((tool) => tool.name === "searchProjectKnowledge")
        ?.description,
    ).toContain("untrusted data");
  });

  it("keeps knowledge search unavailable outside supported project threads", () => {
    const noProject = getAvailableDefaultVoiceTools({
      projectThreadAvailable: false,
    });
    const noExecutor = getAvailableDefaultVoiceTools({
      projectThreadAvailable: true,
      projectToolExecutorAvailable: false,
    });
    for (const available of [noProject, noExecutor]) {
      expect(available.map((tool) => tool.name)).toContain("getProjectStatus");
      expect(available.map((tool) => tool.name)).not.toContain(
        "searchProjectKnowledge",
      );
    }
  });
});
