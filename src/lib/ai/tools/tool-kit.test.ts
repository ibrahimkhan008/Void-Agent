import { describe, expect, it, vi } from "vitest";
import { AppDefaultToolkit, DefaultToolName } from ".";
import { APP_DEFAULT_TOOL_KIT, getAppDefaultToolKitForUser } from "./tool-kit";
import { TOOLKIT_CATALOG } from "./toolkit-catalog";

// The registry is server-only; this test inspects its exported maps without
// exercising server-only runtime guards.
vi.mock("server-only", () => ({}));

describe("application tool registry browser isolation gate", () => {
  it("does not expose Steel/Crawl or Cloak browser automation statically", () => {
    const browserTools = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Browser];

    expect(browserTools).toEqual({});
    expect(browserTools).not.toHaveProperty(DefaultToolName.BrowserAgent);
    expect(browserTools).not.toHaveProperty(DefaultToolName.CloakBrowser);
    expect(
      TOOLKIT_CATALOG.some(
        (toolkit) => toolkit.id === AppDefaultToolkit.Browser,
      ),
    ).toBe(false);
  });

  it("does not re-enable browser automation in user-context maps", () => {
    const tools = getAppDefaultToolKitForUser("test-user", "test-thread");

    expect(tools[AppDefaultToolkit.Browser]).toEqual({});
    expect(tools[AppDefaultToolkit.Browser]).not.toHaveProperty(
      DefaultToolName.BrowserAgent,
    );
    expect(tools[AppDefaultToolkit.Browser]).not.toHaveProperty(
      DefaultToolName.CloakBrowser,
    );

    // Browser-independent outbound tools remain available through their
    // existing bounded/approved paths.
    expect(tools[AppDefaultToolkit.WebSearch]).toHaveProperty(
      DefaultToolName.WebSearch,
    );
    expect(tools[AppDefaultToolkit.Http]).toHaveProperty(DefaultToolName.Http);
  });
});
