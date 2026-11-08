import { describe, expect, it } from "vitest";
import {
  MAX_AGENT_GENERATION_APPS,
  getUnconnectedAgentGenerationApps,
} from "./generation-apps";

describe("getUnconnectedAgentGenerationApps", () => {
  it("removes connected, no-auth, invalid, and duplicate catalog entries", () => {
    expect(
      getUnconnectedAgentGenerationApps(
        [
          { slug: "salesforce", name: " Salesforce " },
          { slug: "hubspot", name: "HubSpot" },
          { slug: "HUBSPOT", name: "Duplicate" },
          { slug: "public", name: "Public service", isNoAuth: true },
          { slug: "unsafe slug", name: "Invalid" },
        ],
        ["salesforce"],
      ),
    ).toEqual([{ slug: "hubspot", name: "HubSpot" }]);
  });

  it("normalizes provider-controlled display names and bounds catalog size", () => {
    const result = getUnconnectedAgentGenerationApps(
      Array.from({ length: MAX_AGENT_GENERATION_APPS + 4 }, (_, index) => ({
        slug: `app-${index}`,
        name: `App\n${index}${"x".repeat(120)}`,
      })),
      [],
    );
    expect(result).toHaveLength(MAX_AGENT_GENERATION_APPS);
    expect(result[0]?.name).not.toContain("\n");
    expect(result[0]?.name.length).toBe(100);
  });

  it("returns no entries for malformed catalog data", () => {
    expect(getUnconnectedAgentGenerationApps(null, [])).toEqual([]);
  });
});
