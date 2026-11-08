import { describe, expect, it } from "vitest";
import { createPlanInputSchema } from "./create-plan-tool";

describe("createPlanInputSchema", () => {
  it("accepts a bounded plan artifact", () => {
    expect(
      createPlanInputSchema.safeParse({
        title: "Ship the feature",
        description: "A clear, reviewable sequence.",
        steps: [
          {
            title: "Inspect requirements",
            description: "Confirm constraints.",
          },
          { title: "Implement", description: "Build the approved scope." },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects empty, oversized, or extra executable input", () => {
    expect(
      createPlanInputSchema.safeParse({ title: " ", steps: [] }).success,
    ).toBe(false);
    expect(
      createPlanInputSchema.safeParse({
        title: "Plan",
        steps: Array.from({ length: 13 }, (_, index) => ({
          title: `Step ${index}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      createPlanInputSchema.safeParse({
        title: "Plan",
        steps: [{ title: "Step" }],
        execute: true,
      }).success,
    ).toBe(false);
  });
});
