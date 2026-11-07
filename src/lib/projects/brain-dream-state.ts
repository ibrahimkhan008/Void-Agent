export const PROJECT_BRAIN_DREAM_STAGES = [
  "dedupe",
  "contradictions",
  "salience",
  "archive",
  "status",
  "done",
] as const;

export type ProjectBrainDreamStage =
  (typeof PROJECT_BRAIN_DREAM_STAGES)[number];

export function getNextProjectBrainDreamStage(
  stage: ProjectBrainDreamStage,
): ProjectBrainDreamStage {
  return (
    PROJECT_BRAIN_DREAM_STAGES[PROJECT_BRAIN_DREAM_STAGES.indexOf(stage) + 1] ??
    "done"
  );
}

export function makeProjectBrainDreamIdempotencyKey(
  reason: "manual" | "nightly",
  date: Date,
) {
  return reason === "manual"
    ? `manual:${date.toISOString().slice(0, 13)}`
    : `nightly:${date.toISOString().slice(0, 10)}`;
}

export function appendProjectBrainDreamWarning(
  warnings: string[],
  stage: Exclude<ProjectBrainDreamStage, "done">,
  message: string,
) {
  return [...warnings, `${stage}: ${message.slice(0, 300)}`];
}

/** Never persist provider messages, source text, tokens, or arbitrary exception details. */
export function sanitizeProjectBrainDreamError(_error: unknown) {
  return "Stage processing failed; details were not exposed.";
}

/** Reuse a current snapshot when a reclaimed stage is replayed. */
export function hasProjectBrainStatusSnapshotForFingerprint(
  snapshotFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return Boolean(
    snapshotFingerprint && snapshotFingerprint === currentFingerprint,
  );
}
