import { createHash } from "node:crypto";
import { z } from "zod";

export const httpRequestApprovalSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    method: z
      .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
      .default("GET"),
    headers: z
      .record(z.string().max(256), z.string().max(4096))
      .optional()
      .default({}),
    body: z.string().max(16_000).optional(),
    timeout: z.number().int().min(1000).max(30_000).optional().default(10_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Object.keys(value.headers).length > 32 ||
      Buffer.byteLength(JSON.stringify(value.headers), "utf8") > 8_000
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["headers"],
        message: "Too many or oversized request headers",
      });
    }
    if (["GET", "HEAD"].includes(value.method) && value.body) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "GET and HEAD requests cannot include a body",
      });
    }
    if (
      Object.keys(value.headers).some(
        (name) =>
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/u.test(name) ||
          /^(host|connection|content-length|transfer-encoding|upgrade|proxy-)/iu.test(
            name,
          ),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["headers"],
        message: "A request header name is invalid or restricted",
      });
    }
  });

export type HttpRequestApproval = z.infer<typeof httpRequestApprovalSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  return value;
}

export const hashHttpRequestApproval = (payload: HttpRequestApproval) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
export const hashHttpRequestApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
