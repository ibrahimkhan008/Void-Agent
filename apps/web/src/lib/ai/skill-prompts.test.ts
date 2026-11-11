import { describe, expect, it, vi } from "vitest";

// ./prompts (lib/ai/prompts.ts) imports lib/db/repository for skill/memory
// context, whose pg repositories carry `server-only`; neutralize it for the
// vitest node environment.
vi.mock("server-only", () => ({}));

import {
  buildSkillCatalogSystemPrompt,
  buildSkillsSystemPrompt,
} from "./prompts";

describe("buildSkillsSystemPrompt", () => {
  it("returns empty string when there are no skills", () => {
    expect(buildSkillsSystemPrompt([])).toBe("");
  });

  it("renders each skill's content in a labeled block", () => {
    const prompt = buildSkillsSystemPrompt([
      { name: "Alpha", description: "does alpha", content: "step one" },
      { name: "Beta", description: undefined, content: "step two" },
    ]);
    expect(prompt).toContain("# Active Skills");
    expect(prompt).toContain('<skill name="Alpha" description="does alpha">');
    expect(prompt).toContain("step one");
    expect(prompt).toContain('<skill name="Beta">');
    expect(prompt).toContain("step two");
  });
});

describe("buildSkillCatalogSystemPrompt", () => {
  it("returns empty string when there are no skills", () => {
    expect(buildSkillCatalogSystemPrompt([])).toBe("");
  });

  it("lists name, description and id for each skill", () => {
    const prompt = buildSkillCatalogSystemPrompt([
      { id: "s1", name: "Alpha", description: "does alpha" },
      { id: "s2", name: "Beta" },
    ]);
    expect(prompt).toContain("# Available Skills");
    expect(prompt).toContain("loadSkill");
    expect(prompt).toContain("- Alpha: does alpha (id: s1)");
    expect(prompt).toContain("- Beta (id: s2)");
  });
});
