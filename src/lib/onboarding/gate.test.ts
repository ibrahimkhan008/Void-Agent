import { describe, expect, it } from "vitest";
import { resolveOnboardingGate } from "./gate";

describe("resolveOnboardingGate", () => {
  it("allows a device that already has the completion cookie", () => {
    expect(
      resolveOnboardingGate({
        hasCompletionCookie: true,
        step: "automation_overview",
      }),
    ).toBe("allow");
  });

  it("uses the stored completion state to sync a missing device cookie", () => {
    expect(
      resolveOnboardingGate({ hasCompletionCookie: false, step: "done" }),
    ).toBe("sync-cookie");
  });

  it("redirects users without a completion cookie or completed state", () => {
    expect(resolveOnboardingGate({ hasCompletionCookie: false })).toBe(
      "redirect",
    );
    expect(
      resolveOnboardingGate({
        hasCompletionCookie: false,
        step: "connect_tools",
      }),
    ).toBe("redirect");
  });
});
