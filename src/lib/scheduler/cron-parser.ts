// ---------------------------------------------------------------------------
import { CronExpressionParser } from "cron-parser";

// P3.1 — #11 scheduled agents. Validates the product's five-field cron
// grammar locally. UTC keeps the original deterministic matcher; non-UTC
// schedules use cron-parser's IANA timezone and DST handling.
//
// Field ranges (matching crontab convention):
//   minute          0-59
//   hour            0-23
//   day-of-month    1-31
//   month           1-12
//   day-of-week     0-6 (Sun=0)
//
// Cron iteration is delegated to cron-parser, with a local filter preserving
// Void-Agent's historical AND semantics when both calendar-day fields are set.
// ---------------------------------------------------------------------------

export const CRON_FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 6 },
] as const;

const SAFETY_BOUND_MS = 4 * 366 * 24 * 60 * 60 * 1000;

type FieldMask = boolean[];

const parseField = (
  raw: string,
  min: number,
  max: number,
): FieldMask | { error: string } => {
  const mask: FieldMask = new Array(max + 1).fill(false);
  const segments = raw.split(",");
  for (const segmentRaw of segments) {
    const segment = segmentRaw.trim();
    if (!segment) {
      return { error: `Empty cron field segment in "${raw}"` };
    }
    let stepStr: string | null = null;
    let body = segment;
    const slashIdx = segment.indexOf("/");
    if (slashIdx !== -1) {
      body = segment.slice(0, slashIdx);
      stepStr = segment.slice(slashIdx + 1);
    }
    let rangeStart: number;
    let rangeEnd: number;
    if (body === "*" || body === "") {
      rangeStart = min;
      rangeEnd = max;
    } else {
      const dashIdx = body.indexOf("-");
      if (dashIdx === -1) {
        const n = Number(body);
        if (!Number.isInteger(n) || Number.isNaN(n)) {
          return { error: `Cron field "${segment}" is not numeric` };
        }
        rangeStart = n;
        rangeEnd = n;
      } else {
        const a = body.slice(0, dashIdx);
        const b = body.slice(dashIdx + 1);
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isInteger(na) || Number.isNaN(na)) {
          return { error: `Cron range start "${a}" is not numeric` };
        }
        if (!Number.isInteger(nb) || Number.isNaN(nb)) {
          return { error: `Cron range end "${b}" is not numeric` };
        }
        rangeStart = na;
        rangeEnd = nb;
      }
    }
    if (rangeStart < min || rangeStart > max) {
      return {
        error: `Cron value ${rangeStart} out of range ${min}-${max}`,
      };
    }
    if (rangeEnd < min || rangeEnd > max) {
      return {
        error: `Cron value ${rangeEnd} out of range ${min}-${max}`,
      };
    }
    if (rangeEnd < rangeStart) {
      return {
        error: `Cron range end ${rangeEnd} < start ${rangeStart}`,
      };
    }
    let step = 1;
    if (stepStr !== null) {
      const n = Number(stepStr);
      if (!Number.isInteger(n) || Number.isNaN(n) || n <= 0) {
        return { error: `Cron step "${stepStr}" is not a positive integer` };
      }
      step = n;
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) {
      mask[v] = true;
    }
  }
  return mask;
};

const parseAllFields = (cron: string): FieldMask[] | { error: string } => {
  const trimmed = cron.trim();
  if (!trimmed) {
    return { error: "Cron expression is empty" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return {
      error: `Cron must have exactly 5 fields, got ${parts.length}`,
    };
  }
  const masks: FieldMask[] = [];
  for (let i = 0; i < 5; i += 1) {
    const parsed = parseField(parts[i], CRON_FIELDS[i].min, CRON_FIELDS[i].max);
    if ("error" in parsed) {
      return { error: `${CRON_FIELDS[i].name}: ${parsed.error}` };
    }
    masks.push(parsed);
  }
  return masks;
};

export const isValidTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const validateCron = (
  cron: string,
  timezone = "UTC",
): { ok: true } | { ok: false; error: string } => {
  const result = parseAllFields(cron);
  if ("error" in result) return { ok: false, error: result.error };
  if (!isValidTimezone(timezone))
    return { ok: false, error: "Timezone must be a valid IANA timezone." };
  try {
    CronExpressionParser.parse(cron, { tz: timezone });
  } catch {
    return {
      ok: false,
      error: "Cron expression is not supported for this timezone.",
    };
  }
  return { ok: true };
};

const matchesCalendarDays = (
  cron: string,
  date: Date,
  timezone: string,
  masks: FieldMask[],
): boolean => {
  const [dayOfMonthField, , dayOfWeekField] = cron.trim().split(/\s+/).slice(2);
  // With either field wildcarded, cron-parser's default behavior already
  // matches the constrained field. When both are constrained, preserve the
  // original Void-Agent behavior: both fields must match.
  if (dayOfMonthField === "*" || dayOfWeekField === "*") return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const weekdayNumber = (
    { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const
  )[weekday as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"];
  return (
    Number.isInteger(day) &&
    weekdayNumber !== undefined &&
    masks[2][day] &&
    masks[4][weekdayNumber]
  );
};

/**
 * Compute the next instant strictly after `from` that matches the cron
 * expression. Throws on invalid input and always returns an absolute Date.
 * UTC retains Void-Agent's legacy matcher; non-UTC uses cron-parser for IANA
 * wall-clock and daylight-saving behavior.
 */
export const computeNextRun = (
  cron: string,
  from: Date,
  timezone = "UTC",
): Date => {
  if (!isValidTimezone(timezone))
    throw new Error(`Invalid timezone "${timezone}".`);
  const masks = parseAllFields(cron);
  if ("error" in masks) {
    throw new Error(`Invalid cron "${cron}": ${masks.error}`);
  }
  try {
    const expression = CronExpressionParser.parse(cron, {
      currentDate: from,
      tz: timezone,
    });
    const limit = from.getTime() + SAFETY_BOUND_MS;
    while (true) {
      const candidate = expression.next().toDate();
      if (candidate.getTime() > limit) break;
      if (matchesCalendarDays(cron, candidate, timezone, masks))
        return candidate;
    }
  } catch {
    throw new Error(`Invalid cron "${cron}" for timezone "${timezone}".`);
  }
  throw new Error(`Cron "${cron}" has no matching run within four years.`);
};
