import { z } from "zod";

function utf8Size(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

const jsonValueAt = (depth: number): z.ZodType<unknown> =>
  z.lazy(() => {
    const scalar = z.union([
      z.null(),
      z.boolean(),
      z.number().finite(),
      z.string().max(20_000),
    ]);
    if (depth >= 20) return scalar;
    const nested = jsonValueAt(depth + 1);
    return z.union([
      scalar,
      z.array(nested).max(1_000),
      z.record(z.string().max(256), nested).superRefine((value, context) => {
        if (Object.keys(value).length > 1_000)
          context.addIssue({ code: "custom", message: "Too many JSON fields" });
      }),
    ]);
  });

const jsonValueSchema = jsonValueAt(0);

export const WorkflowExecutionInputSchema = z
  .record(z.string().max(256), jsonValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 100) {
      context.addIssue({
        code: "custom",
        message: "Too many workflow input fields",
      });
    }
    if (utf8Size(value) > 64_000) {
      context.addIssue({
        code: "custom",
        message: "Workflow input exceeds the allowed size",
      });
    }
  });

export const WorkflowNodeCheckpointSchema = z
  .object({
    input: jsonValueSchema,
    output: jsonValueSchema,
  })
  .strict();

export const WorkflowExecutionEffectSchema = z
  .object({
    nodeId: z.string().uuid(),
    kind: z.enum(["llm", "http", "tool"]),
    target: z.string().min(1).max(512),
    payload: z.record(z.string().max(256), jsonValueSchema),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
    started: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (utf8Size(value) > 64_000) {
      context.addIssue({
        code: "custom",
        message: "Workflow effect exceeds the allowed size",
      });
    }
  });

export const WorkflowExecutionProgressSchema = z
  .object({
    completedNodes: z.record(z.string().uuid(), WorkflowNodeCheckpointSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.completedNodes).length > 500) {
      context.addIssue({
        code: "custom",
        message: "Workflow has too many completed nodes",
      });
    }
    if (utf8Size(value) > 1_000_000) {
      context.addIssue({
        code: "custom",
        message: "Workflow checkpoint exceeds the allowed size",
      });
    }
  });

export type WorkflowExecutionInput = z.infer<
  typeof WorkflowExecutionInputSchema
>;
export type WorkflowNodeCheckpoint = z.infer<
  typeof WorkflowNodeCheckpointSchema
>;
export type WorkflowExecutionProgress = z.infer<
  typeof WorkflowExecutionProgressSchema
>;

export type WorkflowExecutionEffect = {
  nodeId: string;
  kind: "llm" | "http" | "tool";
  target: string;
  payload: Record<string, unknown>;
  hash: string;
  started?: boolean;
};
