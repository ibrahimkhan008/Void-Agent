import { request as httpsRequest } from "node:https";
import { resolvePublicWebhookUrl } from "lib/webhooks/url-guard";

const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

export async function requestPublicWorkflowHttp(input: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}) {
  const { url, addresses } = await resolvePublicWebhookUrl(input.url);
  const destination = addresses[0];
  if (!destination)
    throw new Error("HTTP destination did not resolve to a public address");

  const timeoutMs = Number.isFinite(input.timeoutMs)
    ? Math.max(1, Math.min(MAX_TIMEOUT_MS, Math.trunc(input.timeoutMs)))
    : DEFAULT_TIMEOUT_MS;

  return new Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    size?: number;
  }>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: input.method,
        headers: input.headers,
        // Pin the socket to the address validated above. Keep the URL hostname
        // unchanged so TLS SNI and certificate validation use the real host.
        lookup: (_hostname, _options, callback) =>
          callback(null, destination.address, destination.family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy(
              new Error("HTTP workflow response exceeded the 1 MB limit"),
            );
            return;
          }
          chunks.push(bytes);
        });
        response.on("error", reject);
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            reject(new Error("HTTP workflow redirects are not followed"));
            return;
          }
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === "string") headers[name] = value;
            else if (Array.isArray(value)) headers[name] = value.join(", ");
          }
          const contentLength = headers["content-length"];
          const parsedLength = contentLength
            ? Number.parseInt(contentLength, 10)
            : undefined;
          resolve({
            status,
            statusText: response.statusMessage ?? "",
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            ...(parsedLength !== undefined && Number.isFinite(parsedLength)
              ? { size: parsedLength }
              : {}),
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Request timeout after ${timeoutMs}ms`);
      error.name = "AbortError";
      request.destroy(error);
    });
    request.on("error", reject);
    if (input.body && !["GET", "HEAD"].includes(input.method))
      request.write(input.body);
    request.end();
  });
}
