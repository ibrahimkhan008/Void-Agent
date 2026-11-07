import "server-only";

import {
  UrlBlockedError,
  resolvePublicWebhookUrl,
} from "lib/webhooks/url-guard";
import { Agent, fetch as undiciFetch } from "undici";

export const USER_PROVIDER_MAX_MODELS = 100;
export const USER_PROVIDER_MAX_MODEL_ID_LENGTH = 200;
export const USER_PROVIDER_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const USER_PROVIDER_MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const USER_PROVIDER_MAX_HEADERS_MS = 15_000;
const USER_PROVIDER_MAX_BODY_IDLE_MS = 180_000;
const USER_PROVIDER_MAX_TOTAL_MS = 300_000;
export const USER_PROVIDER_DISCOVERY_TIMEOUT_MS = 15_000;

export function normalizeUserProviderBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new UrlBlockedError(
      "Provider endpoint must be a public HTTPS:443 URL",
    );
  }
  url.port = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

function makePinnedAgent(
  url: URL,
  address: { address: string; family: number },
  maxResponseBytes: number,
) {
  const pinnedLookup = ((
    hostname: string,
    options: { all?: boolean },
    callback: (...args: any[]) => void,
  ) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      callback(new Error("Provider hostname changed during request"));
      return;
    }
    if (options?.all) {
      callback(null, [{ address: address.address, family: address.family }]);
    } else {
      callback(null, address.address, address.family);
    }
  }) as NonNullable<import("node:net").LookupFunction>;

  return new Agent({
    connect: { lookup: pinnedLookup, timeout: 10_000 },
    headersTimeout: USER_PROVIDER_MAX_HEADERS_MS,
    bodyTimeout: USER_PROVIDER_MAX_BODY_IDLE_MS,
    maxResponseSize: maxResponseBytes,
    maxRedirections: 0,
    connections: 1,
    pipelining: 0,
  });
}

function toNativeHeaders(headers: {
  forEach(callback: (value: string, key: string) => void): void;
}): globalThis.Headers {
  const native = new globalThis.Headers();
  headers.forEach((value, key) => native.append(key, value));
  return native;
}

/**
 * HTTPS fetch for a user-configured provider. Every request revalidates all DNS
 * answers and pins the socket to one validated address while TLS continues to
 * verify the original hostname. Redirects are rejected and bodies are bounded.
 */
export async function fetchUserModelProvider(
  input: RequestInfo | URL,
  init: RequestInit = {},
  maxResponseBytes = USER_PROVIDER_MAX_RESPONSE_BYTES,
  totalTimeoutMs = USER_PROVIDER_MAX_TOTAL_MS,
): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
    throw new UrlBlockedError("Provider endpoint must use HTTPS:443");
  }
  const { addresses } = await resolvePublicWebhookUrl(url.toString());
  const pinned = addresses[0];
  if (!pinned) throw new UrlBlockedError("Provider endpoint did not resolve");

  const body = init.body;
  const knownBodyBytes =
    typeof body === "string"
      ? Buffer.byteLength(body)
      : body instanceof ArrayBuffer
        ? body.byteLength
        : ArrayBuffer.isView(body)
          ? body.byteLength
          : body instanceof Blob
            ? body.size
            : body instanceof URLSearchParams
              ? Buffer.byteLength(body.toString())
              : 0;
  if (knownBodyBytes > USER_PROVIDER_MAX_REQUEST_BYTES) {
    throw new Error("Provider request exceeded the size limit");
  }
  let boundedRequestBody = body;
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    let sent = 0;
    boundedRequestBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const part = await reader.read();
        if (part.done) return controller.close();
        sent += part.value.byteLength;
        if (sent > USER_PROVIDER_MAX_REQUEST_BYTES) {
          await reader.cancel("Provider request exceeded the size limit");
          return controller.error(
            new Error("Provider request exceeded the size limit"),
          );
        }
        controller.enqueue(part.value);
      },
      cancel: (reason) => reader.cancel(reason),
    });
  }

  const responseLimit = Math.min(
    USER_PROVIDER_MAX_RESPONSE_BYTES,
    Math.max(1, maxResponseBytes),
  );
  const agent = makePinnedAgent(url, pinned, responseLimit);
  const timeoutSignal = AbortSignal.timeout(totalTimeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  let response: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    response = await undiciFetch(url, {
      ...init,
      body: boundedRequestBody,
      signal,
      redirect: "error",
      dispatcher: agent,
    } as import("undici").RequestInit);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      await agent.destroy().catch(() => undefined);
      throw new Error("Provider redirects are not allowed");
    }
  } catch (error) {
    await agent.destroy().catch(() => undefined);
    throw error;
  }

  if (!response.body) {
    await agent.close().catch(() => undefined);
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: toNativeHeaders(response.headers),
    });
  }

  const reader = response.body.getReader();
  let total = 0;
  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await reader.read();
        if (part.done) {
          controller.close();
          await agent.close().catch(() => undefined);
          return;
        }
        total += part.value.byteLength;
        if (total > responseLimit) {
          await reader.cancel("Provider response exceeded the size limit");
          controller.error(
            new Error("Provider response exceeded the size limit"),
          );
          await agent.destroy().catch(() => undefined);
          return;
        }
        controller.enqueue(part.value);
      } catch (error) {
        controller.error(error);
        await agent.destroy().catch(() => undefined);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      await agent.destroy().catch(() => undefined);
    },
  });
  return new Response(boundedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: toNativeHeaders(response.headers),
  });
}

export function parseOpenAICompatibleModelIds(value: unknown): string[] {
  let candidates: unknown[] = [];
  if (Array.isArray(value)) candidates = value;
  else if (value && typeof value === "object") {
    const object = value as { data?: unknown; models?: unknown };
    if (Array.isArray(object.data)) candidates = object.data;
    else if (Array.isArray(object.models)) candidates = object.models;
  }
  const models = candidates
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      const candidate = entry as { id?: unknown; name?: unknown };
      return typeof candidate.id === "string"
        ? candidate.id.trim()
        : typeof candidate.name === "string"
          ? candidate.name.trim()
          : "";
    })
    .filter(
      (id) => id.length > 0 && id.length <= USER_PROVIDER_MAX_MODEL_ID_LENGTH,
    )
    .slice(0, USER_PROVIDER_MAX_MODELS);
  return [...new Set(models)];
}
