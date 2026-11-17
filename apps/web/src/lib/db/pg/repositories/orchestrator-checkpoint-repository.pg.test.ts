import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  returning: [] as unknown[],
  setValues: undefined as unknown,
  whereClause: undefined as unknown,
}));

vi.mock("../db.pg", () => ({
  pgDb: {
    update: () => ({
      set: (values: unknown) => {
        state.setValues = values;
        return {
          where: (clause: unknown) => {
            state.whereClause = clause;
            return {
              returning: async () => state.returning,
            };
          },
        };
      },
    }),
  },
}));

const { claimOrchestratorCheckpoint } = await import(
  "./orchestrator-checkpoint-repository.pg"
);

function collectStrings(
  value: unknown,
  output = new Set<string>(),
  seen = new WeakSet<object>(),
): Set<string> {
  if (!value || typeof value !== "object") return output;
  if (seen.has(value)) return output;
  seen.add(value);
  for (const item of Object.values(value)) {
    if (typeof item === "string") output.add(item);
    else collectStrings(item, output, seen);
  }
  return output;
}

function collectDates(
  value: unknown,
  output = new Set<number>(),
  seen = new WeakSet<object>(),
) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (value instanceof Date) {
    output.add(value.getTime());
    return output;
  }
  for (const item of Object.values(value)) collectDates(item, output, seen);
  return output;
}

describe("claimOrchestratorCheckpoint", () => {
  beforeEach(() => {
    state.returning = [];
    state.setValues = undefined;
    state.whereClause = undefined;
  });

  it("claims only a failed or stale run for the same user and thread", async () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const claimed = { id: "run-1", status: "running" };
    state.returning = [claimed];

    await expect(
      claimOrchestratorCheckpoint({
        id: "run-1",
        userId: "owner-1",
        threadId: "thread-1",
        now,
      }),
    ).resolves.toEqual(claimed);

    expect(state.setValues).toEqual({ status: "running", updatedAt: now });
    const whereValues = collectStrings(state.whereClause);
    for (const value of [
      "run-1",
      "owner-1",
      "thread-1",
      "failed",
      "running",
      "verifying",
    ]) {
      expect(whereValues.has(value)).toBe(true);
    }
    expect(
      collectDates(state.whereClause).has(now.getTime() - 10 * 60 * 1000),
    ).toBe(true);
  });

  it("returns null when another request already claimed the checkpoint", async () => {
    await expect(
      claimOrchestratorCheckpoint({
        id: "run-1",
        userId: "owner-1",
        threadId: "thread-1",
        now: new Date("2026-11-17T12:00:00Z"),
      }),
    ).resolves.toBeNull();
  });
});
