import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getKernelClient: vi.fn() }));

import { getKernelClient } from "./client";
import { createBrowserSession } from "./session";

describe("Kernel browser egress capability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("blocks direct session creation before contacting Kernel when isolation is absent", async () => {
    vi.stubEnv("BROWSER_EGRESS_ISOLATION_ENABLED", "false");

    await expect(createBrowserSession()).rejects.toThrow(
      "Browser automation is disabled until provider-level network egress isolation is explicitly enabled.",
    );
    expect(getKernelClient).not.toHaveBeenCalled();
  });
});
