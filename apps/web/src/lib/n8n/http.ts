const DEFAULT_MAX_BODY_BYTES = 20_000;

export type ReadN8nJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid" | "too_large" };

/** Read small JSON request bodies without buffering an unbounded payload. */
export async function readN8nJson(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<ReadN8nJsonResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, value: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/** Require same-origin browser requests for n8n mutations. */
export function isSameOriginN8nRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

export function readN8nBodyError(reason: "invalid" | "too_large"): Response {
  return new Response(
    reason === "too_large" ? "Request too large" : "Invalid JSON body",
    { status: reason === "too_large" ? 413 : 400 },
  );
}
