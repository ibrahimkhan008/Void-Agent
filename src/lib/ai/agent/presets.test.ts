import { describe, expect, it } from "vitest";
import { AUTO_SEED_PRESETS, PRESET_AGENTS } from "./presets";

describe("built-in agent preset seeding", () => {
  it("selects only the upstream-designated starter templates", () => {
    expect(AUTO_SEED_PRESETS.map((preset) => preset.presetId)).toEqual([
      "research-agent",
      "crm-manager",
      "sales-coach",
    ]);
    expect(AUTO_SEED_PRESETS.every((preset) => preset.autoSeed)).toBe(true);
    expect(PRESET_AGENTS).toHaveLength(6);
  });
});
