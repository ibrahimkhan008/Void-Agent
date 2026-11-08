import { tool } from "ai";
import { z } from "zod";

export const createPlanInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_200).nullable().optional(),
    steps: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            description: z.string().trim().max(800).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

export const createPlanTool = tool({
  description:
    "Create a plan artifact for the user to review. This tool only presents a plan and never executes any step. In Plan mode, call it exactly once after any needed read-only research.",
  inputSchema: createPlanInputSchema,
  execute: async () => ({ status: "plan_created" as const }),
});
