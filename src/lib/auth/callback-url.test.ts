import { describe, expect, it } from "vitest";
import { authDestination, authLink } from "./callback-url";

describe("post-auth destinations", () => {
  it("preserves a protected path and its query", () => {
    expect(authDestination("/chat/thread?view=tools#result")).toBe(
      "/chat/thread?view=tools#result",
    );
  });
  it.each([
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "/sign-in",
    "/sign-up/email",
    "/api/auth/callback/google",
    "/x/../sign-in",
  ])("rejects unsafe or looping destination %s", (value) => {
    expect(authDestination(value)).toBe("/dashboard");
  });
  it("takes only the first repeated query value", () => {
    expect(authDestination(["/agents", "//evil.example"])).toBe("/agents");
  });
  it("retains the target when switching auth screens", () => {
    const link = new URL(
      authLink("/sign-up", "/chat/123?mode=tools"),
      "https://void-agent.invalid",
    );
    expect(link.pathname).toBe("/sign-up");
    expect(authDestination(link.searchParams.get("callbackUrl"))).toBe(
      "/chat/123?mode=tools",
    );
  });
});
