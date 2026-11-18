import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { executeHookScript } from "./script-executor";

const live = process.env.LIVE_E2B_HOOK_TESTS === "1" ? describe : describe.skip;

live("hook scripts in the owned E2B sandbox", () => {
  it("executes JavaScript, TypeScript, and Python and returns bounded output", async () => {
    if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
    for (const script of [
      {
        language: "javascript" as const,
        source: "console.log(payload.value + 1);",
      },
      {
        language: "typescript" as const,
        source: "const value: number = payload.value; console.log(value + 1);",
      },
      { language: "python" as const, source: "print(payload['value'] + 1)" },
    ]) {
      const result = await executeHookScript({
        script,
        payload: { value: 41 },
        userId: "void-agent-hook-live-verification",
      });
      expect(result.success, result.error).toBe(true);
      expect(result.output).toContain("42");
      expect(result.output.length).toBeLessThanOrEqual(12_000);
    }
  }, 180_000);
});
