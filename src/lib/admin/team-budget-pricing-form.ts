export const MAX_MODEL_RATE_MICROS = 1_000_000_000_000;

/** Parse EUR per million tokens into integer micros without floating point. */
export const parseEuroRateMicros = (value: string): number | undefined => {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{0,6}))?$/.exec(normalized);
  if (!match) return undefined;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(6, "0"));
  const micros = whole * 1_000_000 + fraction;
  return Number.isSafeInteger(micros) && micros <= MAX_MODEL_RATE_MICROS
    ? micros
    : undefined;
};

export const formatEuroRateMicros = (micros: number): string => {
  if (!Number.isSafeInteger(micros) || micros < 0) return "";
  const amount = (micros / 1_000_000).toFixed(6);
  return amount.replace(/0+$/, "").replace(/\.$/, "");
};

export const isValidPricingModelKey = (value: string): boolean => {
  const trimmed = value.trim();
  const slash = trimmed.indexOf("/");
  return (
    trimmed.length >= 3 &&
    trimmed.length <= 300 &&
    slash > 0 &&
    slash < trimmed.length - 1 &&
    trimmed.slice(slash + 1).trim().length > 0
  );
};

export const hasDuplicatePricingModelKey = (
  value: string,
  existing: string[],
): boolean => {
  const normalized = value.trim().toLowerCase();
  return existing.some((key) => key.trim().toLowerCase() === normalized);
};
