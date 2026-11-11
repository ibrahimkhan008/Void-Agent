import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createBrowserAutomationTool } from "./browser-automation-tool";

describe("browser automation execution capability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to construct an executable browser tool without explicit egress capability", () => {
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "false");

    expect(() =>
      createBrowserAutomationTool({ model: {} as LanguageModel }),
    ).toThrow(
      "Browser automation is disabled until provider-level network egress isolation is explicitly enabled.",
    );
  });
});
