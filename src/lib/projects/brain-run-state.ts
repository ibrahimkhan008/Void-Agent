export const PROJECT_BRAIN_RUN_STALE_MS = 5 * 60_000;

function timestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A queued/running extraction older than the worker lease needs attention. */
export function isProjectBrainRunStale(
  status: string,
  updatedAt: Date | string | null | undefined,
  now = Date.now(),
) {
  if (status !== "queued" && status !== "running") return false;
  const updated = timestamp(updatedAt);
  return updated === null || now - updated > PROJECT_BRAIN_RUN_STALE_MS;
}

/** Failed runs and queued/running jobs past their lease can be retried by an editor. */
export function isProjectBrainRunRecoverable(
  status: string,
  updatedAt: Date | string | null | undefined,
  now = Date.now(),
) {
  if (status === "failed") return true;
  return (
    (status === "queued" || status === "running") &&
    isProjectBrainRunStale(status, updatedAt, now)
  );
}

/** The retry affordance is shown only to editors and only when the API accepts recovery. */
export function canOfferProjectBrainRunRetry(
  canEdit: boolean,
  status: string,
  updatedAt: Date | string | null | undefined,
  now = Date.now(),
) {
  return canEdit && isProjectBrainRunRecoverable(status, updatedAt, now);
}

export function isProjectBrainRunClaimable(
  status: string,
  updatedAt: Date | string | null | undefined,
  now = Date.now(),
) {
  return (
    status === "queued" || isProjectBrainRunRecoverable(status, updatedAt, now)
  );
}
