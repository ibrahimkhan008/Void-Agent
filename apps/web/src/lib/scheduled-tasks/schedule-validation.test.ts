import { describe, expect, it } from "vitest";
import {
  ScheduledTaskCreateSchema,
  ScheduledTaskUpdateSchema,
} from "./schedule-validation";

const BASE_CREATE = {
  taskType: "agent" as const,
  executionMode: "chat" as const,
  cronExpression: "0 9 * * *",
  timezone: "UTC",
};

describe("ScheduledTaskCreateSchema model field", () => {
  it("accepts a pinned provider/model string", () => {
    const parsed = ScheduledTaskCreateSchema.parse({
      ...BASE_CREATE,
      model: "anthropic/claude-sonnet-5",
    });
    expect(parsed.model).toBe("anthropic/claude-sonnet-5");
  });

  it("stays unset (Automatic) when absent — the route normalizes to null", () => {
    const parsed = ScheduledTaskCreateSchema.parse(BASE_CREATE);
    expect(parsed.model).toBeUndefined();
  });

  it("rejects a model longer than 120 chars", () => {
    expect(() =>
      ScheduledTaskCreateSchema.parse({
        ...BASE_CREATE,
        model: `x/${"a".repeat(120)}`,
      }),
    ).toThrow();
  });

  it("accepts agentId: null — the dialog sends it for new agent-less schedules", () => {
    // Regression: the schedule dialog explicitly sends agentId: null for a
    // new Chat AI / Cloud Agent schedule (the upsert keys on it); the old
    // optional() silently 400'd every such create.
    const parsed = ScheduledTaskCreateSchema.parse({
      ...BASE_CREATE,
      agentId: null,
      description: null,
    });
    expect(parsed.agentId).toBeNull();
  });
});

describe("ScheduledTaskUpdateSchema model field", () => {
  it("treats model as optional (undefined leaves it untouched)", () => {
    const parsed = ScheduledTaskUpdateSchema.parse({ enabled: false });
    expect(parsed.model).toBeUndefined();
  });

  it("accepts null to clear the pin back to Automatic", () => {
    const parsed = ScheduledTaskUpdateSchema.parse({ model: null });
    expect(parsed.model).toBeNull();
  });
});
