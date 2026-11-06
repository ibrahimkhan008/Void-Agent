import { createHash } from "node:crypto";
import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string().max(8_000),
  z.array(jsonValueSchema).max(100),
  z.record(z.string().max(160), jsonValueSchema).superRefine((value, ctx) => {
    if (Object.keys(value).length > 100) ctx.addIssue({ code: "custom", message: "Too many payload fields" });
  }),
]));

export const mcpToolApprovalSchema = z.object({
  serverId: z.string().uuid(),
  serverName: z.string().trim().min(1).max(128),
  toolName: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,128}$/),
  payload: z.record(z.string().max(160), jsonValueSchema),
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value.payload).length > 100 || Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 16_000) {
    ctx.addIssue({ code: "custom", path: ["payload"], message: "MCP payload exceeds the allowed size" });
  }
});

export type McpToolApproval = z.infer<typeof mcpToolApprovalSchema>;

export function getMcpApprovalTokenKey(properties: Record<string, unknown>) {
  let key = "voidAgentApprovalToken";
  while (Object.hasOwn(properties, key)) key += "_";
  return key;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export const hashMcpToolApproval = (payload: McpToolApproval) => createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
export const hashMcpToolApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
