/** Maximum title length enforced at both the model boundary and persistence. */
export const MAX_THREAD_TITLE_LENGTH = 80;

const QUOTES = /^[\"'`“”‘’«»]+|[\"'`“”‘’«»]+$/g;

/** Normalize untrusted model output into a single-line, bounded title. */
export function normalizeThreadTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const title = collapsed.replace(QUOTES, "").trim();
  return title.length > MAX_THREAD_TITLE_LENGTH
    ? title.slice(0, MAX_THREAD_TITLE_LENGTH).trimEnd()
    : title;
}

/** Use the first user line as a deterministic fallback if title generation fails. */
export function deriveThreadTitleFromText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const firstUserLine = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^user:\s*/i, "").trim())
    .find((line) => Boolean(line) && !/^assistant:\s*/i.test(line));
  return normalizeThreadTitle(firstUserLine ?? "");
}
