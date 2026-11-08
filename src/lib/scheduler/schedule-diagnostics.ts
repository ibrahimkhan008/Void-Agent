import { computeNextRun } from "./cron-parser";

export type ScheduleDiagnosticInput = {
  cron: string;
  timezone?: string | null;
  status: string;
  nextRunAt: Date;
  payload?: Record<string, unknown> | null;
};

/** Compare the stored scheduler checkpoint with the expected recurrence. */
export function getScheduleDiagnostic(job: ScheduleDiagnosticInput, now: Date) {
  const persistedNextRunAt = job.nextRunAt;
  const dueNow =
    job.status === "active" && persistedNextRunAt.getTime() <= now.getTime();
  let computedNextRunAt: Date | null = null;

  if (job.status === "active") {
    if (job.payload?.scheduleType === "once") {
      const runAt = job.payload.runAt;
      if (typeof runAt === "string") {
        const parsed = new Date(runAt);
        if (Number.isFinite(parsed.getTime())) computedNextRunAt = parsed;
      }
    } else {
      try {
        computedNextRunAt = computeNextRun(
          job.cron,
          now,
          job.timezone ?? "UTC",
        );
      } catch {
        // Diagnostics must remain available even if legacy/corrupt schedule
        // data cannot be evaluated. A null expectation is not called drift.
      }
    }
  }

  const scheduleDrift =
    job.status === "active" &&
    !dueNow &&
    computedNextRunAt !== null &&
    Math.abs(computedNextRunAt.getTime() - persistedNextRunAt.getTime()) >
      1_000;

  return {
    persistedNextRunAt: persistedNextRunAt.toISOString(),
    computedNextRunAt: computedNextRunAt?.toISOString() ?? null,
    dueNow,
    scheduleDrift,
  };
}
