import { request as httpsRequest } from "node:https";
import { tool as createTool } from "ai";
import type { JSONSchema7 } from "json-schema";
import { httpRequestApprovalSchema } from "lib/ai/tools/hitl/http-request-approval";
import { httpRequestApprovalRepository } from "lib/db/pg/repositories/http-request-approval-repository.pg";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { resolvePublicWebhookUrl } from "lib/webhooks/url-guard";
import { safe } from "ts-safe";

export const httpFetchSchema: JSONSchema7 = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "The HTTPS URL to make the reviewed request to",
    },
    method: {
      type: "string",
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Request headers reviewed by the user",
    },
    body: { type: "string", description: "Request body reviewed by the user" },
    timeout: { type: "number", description: "Request timeout in milliseconds" },
    approvalToken: {
      type: "string",
      minLength: 40,
      maxLength: 128,
      description: "Short-lived one-use token from proposeHttpRequest",
    },
  },
  required: ["url", "approvalToken"],
  additionalProperties: false,
};

export function createHttpFetchTool(userId?: string) {
  return createTool({
    description:
      "Make an HTTPS request to a public host only after the user explicitly approves the exact URL, method, headers, body and timeout using proposeHttpRequest. Redirects are not followed. The approval token is short-lived, user-bound and single-use.",
    inputSchema: jsonSchemaToZod(httpFetchSchema),
    execute: async ({
      url,
      method = "GET",
      headers,
      body,
      timeout = 10_000,
      approvalToken,
    }) =>
      safe(async () => {
        if (!userId)
          throw new Error(
            "Authenticated user context is required for outbound HTTP requests",
          );
        const approval = {
          url: url.trim(),
          method,
          headers: headers ?? {},
          ...(body === undefined ? {} : { body }),
          timeout,
        } as const;
        const parsed = httpRequestApprovalSchema.safeParse(approval);
        if (!parsed.success)
          throw new Error("HTTP request is invalid or exceeds safe limits");
        const { url: safeUrl, addresses } = await resolvePublicWebhookUrl(
          parsed.data.url,
        );
        if (
          !(await httpRequestApprovalRepository.consume(
            userId,
            approvalToken,
            parsed.data,
          ))
        ) {
          throw new Error(
            "This exact HTTP request has not been approved, or its approval expired or was already used",
          );
        }
        const destination = addresses[0];
        if (!destination)
          throw new Error(
            "HTTP destination did not resolve to a public address",
          );
        const response = await new Promise<{
          status: number;
          statusText: string;
          headers: Record<string, string | string[] | number | undefined>;
          body: string;
        }>((resolve, reject) => {
          const request = httpsRequest(
            safeUrl,
            {
              method: parsed.data.method,
              headers: parsed.data.headers,
              // Pin the TCP connection to the exact address already checked by
              // resolvePublicWebhookUrl while retaining URL hostname for TLS SNI
              // and certificate validation. No second DNS lookup can rebind it.
              lookup: (_hostname, _options, callback) =>
                callback(null, destination.address, destination.family),
            },
            (incoming) => {
              const chunks: Buffer[] = [];
              let size = 0;
              incoming.on("data", (chunk: Buffer | string) => {
                const bytes = Buffer.isBuffer(chunk)
                  ? chunk
                  : Buffer.from(chunk);
                size += bytes.byteLength;
                if (size > 64_000) {
                  incoming.destroy(
                    new Error("HTTP response exceeded the 64 KB tool limit"),
                  );
                  return;
                }
                chunks.push(bytes);
              });
              incoming.on("error", reject);
              incoming.on("end", () => {
                resolve({
                  status: incoming.statusCode ?? 0,
                  statusText: incoming.statusMessage ?? "",
                  headers: incoming.headers,
                  body: Buffer.concat(chunks).toString("utf8"),
                });
              });
            },
          );
          const timeoutId = setTimeout(
            () => request.destroy(new Error("HTTP request timed out")),
            parsed.data.timeout,
          );
          request.on("error", reject);
          request.on("close", () => clearTimeout(timeoutId));
          if (parsed.data.body && !["GET", "HEAD"].includes(parsed.data.method))
            request.write(parsed.data.body);
          request.end();
        });
        const contentType = response.headers["content-type"];
        const isJson =
          typeof contentType === "string" &&
          contentType.includes("application/json");
        let responseBody: unknown = response.body;
        if (isJson) {
          try {
            responseBody = JSON.parse(response.body);
          } catch {
            /* Return malformed JSON as text. */
          }
        }
        const normalizedHeaders = Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(", ") : value,
          ]),
        );
        return {
          status: response.status,
          statusText: response.statusText,
          headers: normalizedHeaders,
          body: responseBody,
          ok: response.status >= 200 && response.status < 300,
          url: safeUrl.toString(),
        };
      })
        .ifFail((error) => ({
          isError: true,
          error: error instanceof Error ? error.message : "HTTP request failed",
          solution:
            "Review and approve the exact HTTPS request. Only public hosts are allowed, DNS is pinned for this request, redirects are not followed, and response bodies are limited to 64 KB.",
        }))
        .unwrap(),
  });
}

// The static toolkit fallback intentionally has no user context and therefore
// cannot make outbound requests. Authenticated chats replace this with a scoped tool.
export const httpFetchTool = createHttpFetchTool();
