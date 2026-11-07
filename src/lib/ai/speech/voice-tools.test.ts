import { describe, expect, it } from "vitest";
import { getAvailableDefaultVoiceTools } from "./index";

describe("project-scoped voice tool availability", () => {
  it("exposes knowledge tools only for a project thread with a client executor", () => {
    const available = getAvailableDefaultVoiceTools({
      projectThreadAvailable: true,
    });
    expect(available.map((tool) => tool.name)).toContain("getProjectStatus");
    expect(available.map((tool) => tool.name)).toContain(
      "searchProjectKnowledge",
    );
    expect(
      available.find((tool) => tool.name === "searchProjectKnowledge")
        ?.description,
    ).toContain("untrusted data");
  });

  it("does not expose project tools in ordinary or unsupported voice sessions", () => {
    const noProject = getAvailableDefaultVoiceTools({
      projectThreadAvailable: false,
    });
    const noExecutor = getAvailableDefaultVoiceTools({
      projectThreadAvailable: true,
      projectToolExecutorAvailable: false,
    });
    for (const available of [noProject, noExecutor]) {
      expect(available.map((tool) => tool.name)).not.toContain(
        "getProjectStatus",
      );
      expect(available.map((tool) => tool.name)).not.toContain(
        "searchProjectKnowledge",
      );
    }
  });
});
