const MAX_PROVIDER_IMAGE_BYTES = 15 * 1024 * 1024;
const PROVIDER_IMAGE_TIMEOUT_MS = 20_000;

export type ProviderImage = {
  base64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

function validatedProviderImageUrl(
  rawUrl: string,
  providerBaseUrl: string,
): URL {
  let url: URL;
  let provider: URL;
  try {
    url = new URL(rawUrl);
    provider = new URL(providerBaseUrl);
  } catch {
    throw new Error("Image provider returned an invalid image URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    provider.protocol !== "https:" ||
    url.origin !== provider.origin
  ) {
    throw new Error("Image provider returned an untrusted image URL.");
  }
  return url;
}

function sniffRasterImage(buffer: Buffer): ProviderImage["mimeType"] | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateProviderImageBytes(
  value: Uint8Array,
  declaredMimeType?: string,
): ProviderImage {
  if (value.byteLength === 0 || value.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error(
      "Image provider output is empty or exceeds the 15 MiB limit.",
    );
  }
  const bytes = Buffer.from(value);
  const mimeType = sniffRasterImage(bytes);
  if (!mimeType) {
    throw new Error("Image provider output is not a supported raster image.");
  }
  if (
    declaredMimeType &&
    declaredMimeType.split(";", 1)[0]!.trim().toLowerCase() !== mimeType
  ) {
    throw new Error("Image provider output did not match its image signature.");
  }
  return { base64: bytes.toString("base64"), mimeType };
}

async function readBoundedBody(
  response: Response,
  maxBytes = MAX_PROVIDER_IMAGE_BYTES,
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Provider response exceeds the ${maxBytes}-byte limit.`);
  }

  if (!response.body)
    throw new Error("Image provider returned an empty image.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `Provider response exceeds the ${maxBytes}-byte limit.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0)
    throw new Error("Image provider returned an empty image.");
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes,
  );
}

export async function readProviderJson<T>(
  response: Response,
  maxBytes = 22 * 1024 * 1024,
): Promise<T> {
  const bytes = await readBoundedBody(response, maxBytes);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    throw new Error("Image provider returned invalid JSON.");
  }
}

/**
 * Fetch an image URL returned by the configured provider. The response body
 * is still untrusted: only the exact configured HTTPS origin is allowed,
 * redirects are refused, and response bytes are bounded and signature-checked.
 */
export async function downloadProviderImage(
  rawUrl: string,
  providerBaseUrl: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ProviderImage> {
  const url = validatedProviderImageUrl(rawUrl, providerBaseUrl);
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Image provider download timed out.")),
    PROVIDER_IMAGE_TIMEOUT_MS,
  );
  const onAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `Image provider output request failed (${response.status}).`,
      );
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const allowedMimeTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
    if (!allowedMimeTypes.has(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Image provider returned an unsupported image type.");
    }

    return validateProviderImageBytes(
      await readBoundedBody(response),
      contentType,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
