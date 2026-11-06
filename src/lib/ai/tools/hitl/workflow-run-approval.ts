import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_APPROVAL_JSON_DEPTH = 24;
const jsonValueSchemaAt = (depth: number): z.ZodType<unknown> =>
  z.lazy(() => {
    const scalar = z.union([
      z.null(),
      z.boolean(),
      z.number().finite(),
      z.string().max(8_000),
    ]);
    if (depth >= MAX_APPROVAL_JSON_DEPTH) return scalar;
    const nested = jsonValueSchemaAt(depth + 1);
    return z.union([
      scalar,
      z.array(nested).max(100),
      z.record(z.string().max(160), nested).superRefine((value, ctx) => {
        if (Object.keys(value).length > 100)
          ctx.addIssue({ code: "custom", message: "Too many payload fields" });
      }),
    ]);
  });
const jsonValueSchema = jsonValueSchemaAt(0);

export const workflowRunApprovalSchema = z
  .object({
    platform: z.enum(["windmill", "activepieces", "saved-workflow", "n8n"]),
    target: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
    workflowName: z.string().trim().min(1).max(160).optional(),
    graphRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    approvalTokenField: z
      .string()
      .trim()
      .regex(/^[A-Za-z_][A-Za-z0-9_]{0,80}$/u)
      .optional(),
    payload: z.record(z.string().max(160), jsonValueSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Object.keys(value.payload).length > 100 ||
      Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 16_000
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: "Workflow payload exceeds the allowed size",
      });
    }
    if (value.platform === "saved-workflow") {
      if (!z.string().uuid().safeParse(value.target).success)
        ctx.addIssue({
          code: "custom",
          path: ["target"],
          message: "Saved workflow ID is invalid",
        });
      if (
        !value.workflowName ||
        !value.approvalTokenField ||
        !value.graphRevision
      )
        ctx.addIssue({
          code: "custom",
          path: ["workflowName"],
          message:
            "Workflow name, graph revision, and approval field are required",
        });
    }
    if (value.platform === "n8n") {
      if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value.target))
        ctx.addIssue({
          code: "custom",
          path: ["target"],
          message: "n8n workflow ID is invalid",
        });
      if (!value.workflowName || !value.graphRevision)
        ctx.addIssue({
          code: "custom",
          path: ["workflowName"],
          message: "n8n workflow name and revision are required",
        });
    }
  });

export type WorkflowRunApproval = z.infer<typeof workflowRunApprovalSchema>;

export function getWorkflowApprovalTokenField(
  properties: Record<string, unknown>,
) {
  let key = "voidAgentWorkflowApprovalToken";
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

export const hashWorkflowRunApproval = (payload: WorkflowRunApproval) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
export const hashWorkflowApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
