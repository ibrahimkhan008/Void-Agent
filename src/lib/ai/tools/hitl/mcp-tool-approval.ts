import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(8_000),
    z.array(jsonValueSchema).max(100),
    z.record(z.string().max(160), jsonValueSchema).superRefine((value, ctx) => {
      if (Object.keys(value).length > 100)
        ctx.addIssue({ code: "custom", message: "Too many payload fields" });
    }),
  ]),
);

const mcpToolApprovalObjectSchema = z.object({
  /** Present only for voice-agent delegated actions; bound into the approval hash. */
  agentId: z.string().uuid().optional(),
  serverId: z.string().uuid(),
  serverName: z.string().trim().min(1).max(128),
  toolName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{1,128}$/),
  payload: z.record(z.string().max(160), jsonValueSchema),
});

function refineMcpToolApprovalPayload(
  value: { payload: Record<string, unknown> },
  ctx: z.RefinementCtx,
) {
  if (
    Object.keys(value.payload).length > 100 ||
    Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 16_000
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["payload"],
      message: "MCP payload exceeds the allowed size",
    });
  }
}

export const mcpToolApprovalRequestSchema = mcpToolApprovalObjectSchema
  .strict()
  .superRefine(refineMcpToolApprovalPayload);

/** Proposal-only contract. The UI sends the fingerprint captured with the MCP tool definition. */
export const mcpToolApprovalProposalSchema = mcpToolApprovalObjectSchema
  .extend({
    serverConfigFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine(refineMcpToolApprovalPayload);

// Kept as the public name used by the proposal tool and its existing callers.
export const mcpToolApprovalSchema = mcpToolApprovalRequestSchema;

export type McpToolApprovalRequest = z.infer<
  typeof mcpToolApprovalRequestSchema
>;
export type McpToolApproval = McpToolApprovalRequest & {
  serverConfigFingerprint: string;
};

export function createMcpServerConfigFingerprint(config: unknown) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to fingerprint MCP server configuration",
    );
  }
  const serializedConfig = JSON.stringify(canonicalize(config));
  if (serializedConfig === undefined) {
    throw new Error("MCP server configuration cannot be fingerprinted");
  }
  return createHmac("sha256", secret).update(serializedConfig).digest("hex");
}

export function getMcpApprovalTokenKey(properties: Record<string, unknown>) {
  let key = "voidAgentApprovalToken";
  while (Object.hasOwn(properties, key)) key += "_";
  return key;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export const hashMcpToolApproval = (payload: McpToolApprovalRequest) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
export const hashMcpToolApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
