import "server-only";

import { request as httpsRequest } from "node:https";
import { resolvePublicWebhookUrl } from "lib/webhooks/url-guard";

export const PROVIDER_DISCOVERY_TIMEOUT_MS = 10_000;
export const PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES = 64_000;

export class ProviderDiscoveryTimeoutError extends Error {
  constructor() {
    super("Provider discovery timed out");
    this.name = "ProviderDiscoveryTimeoutError";
  }
}

export class ProviderDiscoveryResponseTooLargeError extends Error {
  constructor() {
    super("Provider discovery response exceeded the size limit");
    this.name = "ProviderDiscoveryResponseTooLargeError";
  }
}

export interface ProviderDiscoveryResponse {
  status: number;
  statusText: string;
  body: string;
}

/** Validate, DNS-pin, and fetch a public HTTPS provider endpoint without following redirects. */
export async function requestProviderDiscovery(
  rawUrl: string,
  apiKey?: string,
): Promise<ProviderDiscoveryResponse> {
  const { url, addresses } = await resolvePublicWebhookUrl(rawUrl);
  const destination = addresses[0];
  if (!destination) throw new Error("Provider discovery failed");

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let request: ReturnType<typeof httpsRequest>;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    };

    try {
      request = httpsRequest(
        url,
        {
          headers: apiKey
            ? { Authorization: `Bearer ${apiKey}`, "api-key": apiKey }
            : {},
          // Retain hostname for TLS SNI/certificate validation while pinning
          // the socket to the address already checked by the SSRF guard.
          lookup: (_hostname, _options, callback) =>
            callback(null, destination.address, destination.family),
        },
        (incoming) => {
          const declaredLength = Number(incoming.headers["content-length"]);
          if (
            Number.isFinite(declaredLength) &&
            declaredLength > PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES
          ) {
            incoming.destroy();
            request.destroy();
            finishError(new ProviderDiscoveryResponseTooLargeError());
            return;
          }

          const chunks: Buffer[] = [];
          let total = 0;
          incoming.on("data", (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += bytes.byteLength;
            if (total > PROVIDER_DISCOVERY_MAX_RESPONSE_BYTES) {
              incoming.destroy();
              request.destroy();
              finishError(new ProviderDiscoveryResponseTooLargeError());
              return;
            }
            chunks.push(bytes);
          });
          incoming.on("aborted", () =>
            finishError(new Error("Provider request failed")),
          );
          incoming.on("error", () =>
            finishError(new Error("Provider request failed")),
          );
          incoming.on("end", () => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resolve({
              status: incoming.statusCode ?? 0,
              statusText: incoming.statusMessage ?? "",
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      request.on("error", () =>
        finishError(new Error("Provider request failed")),
      );
      timeout = setTimeout(() => {
        finishError(new ProviderDiscoveryTimeoutError());
        request.destroy();
      }, PROVIDER_DISCOVERY_TIMEOUT_MS);
      request.end();
    } catch {
      finishError(new Error("Provider request failed"));
    }
  });
}
