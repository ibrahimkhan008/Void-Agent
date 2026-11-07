const VIDEO_URL_KEYS = new Set([
  "video_url",
  "videourl",
  "output_url",
  "outputurl",
]);
const POSTER_KEYS = new Set([
  "thumbnail_url",
  "thumbnailurl",
  "poster_url",
  "posterurl",
]);
const MAX_NODES = 500;
const MAX_DEPTH = 8;

export type WorkflowVideoMedia = { url: string; poster?: string };

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return;
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      parsed.hostname.endsWith(".local")
    )
      return;
    return parsed.href;
  } catch {
    return;
  }
}

function looksLikeVideoUrl(value: string) {
  try {
    return /\.(mp4|webm|mov|m3u8)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/** Extract bounded HTTPS video results from workflow output, including n8n HLS and legacy video records. */
export function extractWorkflowVideoMedia(
  value: unknown,
): WorkflowVideoMedia[] {
  const found: WorkflowVideoMedia[] = [];
  const seen = new Set<string>();
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;

  while (stack.length && visited < MAX_NODES && found.length < 12) {
    const current = stack.pop()!;
    visited += 1;
    if (
      !current.value ||
      typeof current.value !== "object" ||
      current.depth > MAX_DEPTH
    )
      continue;
    if (Array.isArray(current.value)) {
      for (const item of current.value.slice(0, MAX_NODES - visited).reverse())
        stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }

    const record = current.value as Record<string, unknown>;
    const entries = Object.entries(record);
    const candidate = entries.find(([key]) =>
      VIDEO_URL_KEYS.has(key.toLowerCase()),
    )?.[1];
    const directUrl =
      candidate ??
      entries.find(
        ([key, item]) =>
          key.toLowerCase() === "url" &&
          typeof item === "string" &&
          looksLikeVideoUrl(item),
      )?.[1];
    const url = safeHttpsUrl(directUrl);
    if (
      url &&
      (candidate !== undefined || looksLikeVideoUrl(url)) &&
      !seen.has(url)
    ) {
      seen.add(url);
      const poster = safeHttpsUrl(
        entries.find(([key]) => POSTER_KEYS.has(key.toLowerCase()))?.[1],
      );
      found.push(poster ? { url, poster } : { url });
    }
    for (const [, nested] of entries.reverse()) {
      if (nested && typeof nested === "object")
        stack.push({ value: nested, depth: current.depth + 1 });
    }
  }
  return found;
}
