import { describe, expect, it } from "vitest";
import { getScheduleDiagnostic } from "./schedule-diagnostics";

const now = new Date("2026-11-08T08:30:00.000Z");

describe("getScheduleDiagnostic", () => {
  it("reports the persisted and cron-computed next run without drift when they match", () => {
    const nextRunAt = new Date("2026-11-08T08:31:00.000Z");
    expect(
      getScheduleDiagnostic(
        {
          cron: "* * * * *",
          timezone: "UTC",
          status: "active",
          nextRunAt,
          payload: { scheduleType: "recurring" },
        },
        now,
      ),
    ).toEqual({
      persistedNextRunAt: nextRunAt.toISOString(),
      computedNextRunAt: nextRunAt.toISOString(),
      dueNow: false,
      scheduleDrift: false,
    });
  });

  it("flags a future stored timestamp that disagrees with the next cron occurrence", () => {
    const persistedNextRunAt = new Date("2026-11-08T08:32:00.000Z");
    expect(
      getScheduleDiagnostic(
        {
          cron: "* * * * *",
          timezone: "UTC",
          status: "active",
          nextRunAt: persistedNextRunAt,
          payload: { scheduleType: "recurring" },
        },
        now,
      ),
    ).toEqual({
      persistedNextRunAt: persistedNextRunAt.toISOString(),
      computedNextRunAt: "2026-11-08T08:31:00.000Z",
      dueNow: false,
      scheduleDrift: true,
    });
  });

  it("reports overdue jobs as due instead of misclassifying them as drift", () => {
    const nextRunAt = new Date("2026-11-08T08:29:00.000Z");
    expect(
      getScheduleDiagnostic(
        {
          cron: "* * * * *",
          status: "active",
          nextRunAt,
          payload: { scheduleType: "recurring" },
        },
        now,
      ),
    ).toMatchObject({ dueNow: true, scheduleDrift: false });
  });

  it("uses the stored one-time run time and avoids interpreting its synthetic cron", () => {
    const runAt = "2026-11-08T08:31:00.000Z";
    expect(
      getScheduleDiagnostic(
        {
          cron: "not-a-cron",
          status: "active",
          nextRunAt: new Date(runAt),
          payload: { scheduleType: "once", runAt },
        },
        now,
      ),
    ).toMatchObject({
      computedNextRunAt: runAt,
      dueNow: false,
      scheduleDrift: false,
    });
  });

  it("does not claim drift when an invalid recurring schedule cannot be computed", () => {
    expect(
      getScheduleDiagnostic(
        {
          cron: "invalid",
          status: "active",
          nextRunAt: new Date("2026-11-08T08:31:00.000Z"),
          payload: { scheduleType: "recurring" },
        },
        now,
      ),
    ).toMatchObject({ computedNextRunAt: null, scheduleDrift: false });
  });
});
