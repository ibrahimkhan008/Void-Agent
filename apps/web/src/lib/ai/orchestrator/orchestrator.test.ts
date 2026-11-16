import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orchestratorSchema } from "./orchestrator";

describe("orchestratorSchema", () => {
  const worker = {
    key: "06a",
    role: "research" as const,
    name: "Research Agent",
    task: "Gather the facts",
  };

  it("accepts a valid plan with a verification gate", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "Build and verify a landing page",
      workers: [worker, { ...worker, key: "06b", role: "build" }],
      verificationCriteria: "The page renders a heading",
    });
    expect(parsed.success).toBe(true);
  });

  it("caps the worker team at 4", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: Array.from({ length: 5 }, (_, i) => ({
        ...worker,
        key: `w${i}`,
      })),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown roles", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [{ ...worker, role: "demolition" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects worker keys with path-hostile characters", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [{ ...worker, key: "../../etc" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires at least one worker", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [],
    });
    expect(parsed.success).toBe(false);
  });
});
