import "server-only";

import { type RequestOptions, request as httpsRequest } from "node:https";
import { resolvePublicWebhookUrl } from "@/lib/webhooks/url-guard";

const MAX_URL_LENGTH = 2_048;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

function htmlToText(html: string) {
  return html
    .replace(
      /<\s*(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\s*\1\s*>/giu,
      " ",
    )
    .replace(/<!--([\s\S]*?)-->/gu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Fetch public text without following redirects or allowing DNS to rebind. */
export async function downloadPublicTextUrl(raw: string) {
  if (raw.length > MAX_URL_LENGTH) throw new Error("URL is too long");
  const { url, addresses } = await resolvePublicWebhookUrl(raw);
  if (url.port && url.port !== "443") {
    throw new Error("URL must use the standard HTTPS port");
  }

  const options: RequestOptions = {
    method: "GET",
    headers: {
      Accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
      "User-Agent": "Void Agent-Knowledge-Importer/1.0",
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxHeaderSize: 16 * 1024,
    // Use only the already-validated A/AAAA results for this connection.
    // TLS still verifies the original URL hostname.
    lookup: ((hostname, lookupOptions, callback) => {
      if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
        callback(new Error("Unexpected DNS lookup"), "", 0);
        return;
      }
      const pinned = addresses.map(({ address, family }) => ({
        address,
        family,
      }));
      if (typeof lookupOptions === "object" && lookupOptions.all) {
        callback(null, pinned);
      } else {
        const first = pinned[0];
        if (!first) callback(new Error("No validated address"), "", 0);
        else callback(null, first.address, first.family);
      }
    }) as RequestOptions["lookup"],
  };

  const downloaded = await new Promise<{ body: Buffer; contentType: string }>(
    (resolve, reject) => {
      const request = httpsRequest(url, options, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400
                ? "URL redirects are not allowed"
                : "URL source returned an unsuccessful response",
            ),
          );
          return;
        }
        const contentType = response.headers["content-type"]
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();
        if (
          contentType !== "text/plain" &&
          contentType !== "text/html" &&
          contentType !== "application/xhtml+xml"
        ) {
          response.resume();
          reject(new Error("URL source must return HTML or plain text"));
          return;
        }
        const length = Number(response.headers["content-length"]);
        if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("URL source is too large"));
          reject(new Error("URL source is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (value: Buffer | Uint8Array) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          total += chunk.length;
          if (total > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("URL source is too large"));
            reject(new Error("URL source is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            contentType: contentType ?? "",
          }),
        );
        response.on("error", reject);
      });
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error("URL source request timed out"));
      });
      request.on("error", reject);
      request.end();
    },
  );

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(downloaded.body);
  } catch {
    throw new Error("URL source is not valid UTF-8 text");
  }
  const text =
    downloaded.contentType === "text/plain"
      ? decoded.trim()
      : htmlToText(decoded);
  if (!text) throw new Error("URL source contains no extractable text");
  return { text, sourceOrigin: url.origin };
}

export const collectionUrlLimits = {
  maxUrlLength: MAX_URL_LENGTH,
  maxResponseBytes: MAX_RESPONSE_BYTES,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
};
