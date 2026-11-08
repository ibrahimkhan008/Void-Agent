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

export function safeWorkflowVideoUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    // Browser playback must never target an IP literal, local/private host
    // suffix, or alternate service port supplied by workflow output.
    if (
      hostname.startsWith("[") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home.arpa") ||
      (parsed.port !== "" && parsed.port !== "443")
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

export type WorkflowVideoPlaybackMode =
  | "direct"
  | "hlsjs"
  | "native-hls"
  | "unsupported"
  | "invalid";

/** Select the bounded browser playback path for a workflow-provided URL. */
export function getWorkflowVideoPlaybackMode(
  value: unknown,
  options: { nativeHls: boolean; hlsJs: boolean },
): WorkflowVideoPlaybackMode {
  const url = safeWorkflowVideoUrl(value);
  if (!url || !looksLikeVideoUrl(url)) return "invalid";
  if (!/\.m3u8$/i.test(new URL(url).pathname)) return "direct";
  if (options.hlsJs) return "hlsjs";
  if (options.nativeHls) return "native-hls";
  return "unsupported";
}

/** Hls.js may load only HTTPS resources on the explicitly selected manifest origin. */
export function isAllowedHlsResourceUrl(
  resourceUrl: string,
  manifestUrl: string,
): boolean {
  const safeResource = safeWorkflowVideoUrl(resourceUrl);
  const safeManifest = safeWorkflowVideoUrl(manifestUrl);
  if (!safeResource || !safeManifest) return false;
  try {
    return new URL(safeResource).origin === new URL(safeManifest).origin;
  } catch {
    return false;
  }
}

/** Native HLS implementations do not expose playlist children for policy checks. */
export function isSameOriginWorkflowVideo(
  value: unknown,
  pageOrigin: string,
): boolean {
  const url = safeWorkflowVideoUrl(value);
  if (!url) return false;
  try {
    return new URL(url).origin === new URL(pageOrigin).origin;
  } catch {
    return false;
  }
}

/** Build a credential-free, non-redirecting request for a validated HLS child. */
export function createSafeHlsRequest(
  resourceUrl: string,
  manifestUrl: string,
  init: RequestInit,
): Request {
  if (!isAllowedHlsResourceUrl(resourceUrl, manifestUrl)) {
    throw new Error("Blocked HLS resource outside manifest origin");
  }
  return new Request(resourceUrl, {
    ...init,
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
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
    const url = safeWorkflowVideoUrl(directUrl);
    if (
      url &&
      (candidate !== undefined || looksLikeVideoUrl(url)) &&
      !seen.has(url)
    ) {
      seen.add(url);
      const poster = safeWorkflowVideoUrl(
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
