import { describe, expect, it } from "vitest";
import { COCKPIT_UPDATE_TYPES, parseCockpitUpdateSeverity } from "./updates";

describe("cockpit update notification types", () => {
  it("includes every severity written by the user-scoped update tool", () => {
    expect(COCKPIT_UPDATE_TYPES).toEqual([
      "agent_update_info",
      "agent_update_warning",
      "agent_update_alert",
    ]);
  });

  it("maps known persisted update types and rejects unrelated notifications", () => {
    expect(parseCockpitUpdateSeverity("agent_update_info")).toBe("info");
    expect(parseCockpitUpdateSeverity("agent_update_warning")).toBe("warning");
    expect(parseCockpitUpdateSeverity("agent_update_alert")).toBe("alert");
    expect(parseCockpitUpdateSeverity("agent_update_unknown")).toBeNull();
    expect(
      parseCockpitUpdateSeverity("project_brain_run_completed"),
    ).toBeNull();
  });
});
