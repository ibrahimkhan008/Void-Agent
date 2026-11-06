export type UpdateCheckSource =
  | "startup"
  | "interval"
  | "focus"
  | "manual"
  | "renderer";

export const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const FOCUS_CHECK_MIN_GAP_MS = 30 * 60 * 1000;

export function isForcedUpdateCheck(source: UpdateCheckSource): boolean {
  return source === "manual" || source === "renderer";
}

export function shouldRunUpdateCheck(input: {
  lastCheckAt: number | null;
  now: number;
  minGapMs: number;
}): boolean {
  return (
    input.lastCheckAt === null ||
    input.now - input.lastCheckAt >= input.minGapMs
  );
}
