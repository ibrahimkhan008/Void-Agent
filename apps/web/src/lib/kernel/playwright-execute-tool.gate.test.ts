import type { Kernel } from "@onkernel/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPlaywrightExecuteTool } from "./playwright-execute-tool";

describe("Kernel Playwright execution capability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not construct a remote Playwright executor without explicit egress capability", () => {
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "false");

    expect(() =>
      createPlaywrightExecuteTool({
        client: {} as Kernel,
        sessionId: "session-1",
      }),
    ).toThrow(
      "Browser automation is disabled until provider-level network egress isolation is explicitly enabled.",
    );
  });
});
