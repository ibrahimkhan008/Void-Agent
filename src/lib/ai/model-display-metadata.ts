import { z } from "zod";
import { normalizeModelKey } from "./model-pricing";

export const AUTOMATIC_ROUTING_TASKS = [
  "general_chat",
  "coding",
  "web_development",
  "web_search",
  "document_extraction",
  "tool_calling",
  "writing",
  "reasoning",
  "vision",
] as const;

const AutomaticRoutingScoresSchema = z
  .object(
    Object.fromEntries(
      AUTOMATIC_ROUTING_TASKS.map((task) => [
        task,
        z.number().int().min(0).max(100).optional(),
      ]),
    ) as Record<
      (typeof AUTOMATIC_ROUTING_TASKS)[number],
      z.ZodOptional<z.ZodNumber>
    >,
  )
  .strict()
  .superRefine((scores, context) => {
    if (
      !Object.values(scores).some((score) => score !== undefined && score > 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Automatic routing scores must include at least one positive task score",
      });
    }
  });

/** Public catalog presentation data; deliberately separate from EUR budget rates. */
export const ModelDisplayMetadataSchema = z
  .object({
    developer: z.string().trim().min(1).max(100).optional(),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    hiddenGem: z.boolean().optional(),
    caution: z.boolean().optional(),
    notRecommended: z.boolean().optional(),
    cheapAlternative: z.boolean().optional(),
    speed: z.boolean().optional(),
    thinking: z.boolean().optional(),
    maxPerformance: z.boolean().optional(),
    inputPriceUsd: z.number().finite().min(0).max(100_000).optional(),
    outputPriceUsd: z.number().finite().min(0).max(100_000).optional(),
    /** Admin-authored routing policy; absent scores exclude this model from personal Auto. */
    automaticRoutingPriority: z.number().int().min(0).max(1000).optional(),
    automaticRoutingScores: AutomaticRoutingScoresSchema.optional(),
    /** Context size verified by an admin for provider models absent from the static catalog. */
    automaticRoutingContextTokens: z
      .number()
      .int()
      .min(1)
      .max(2_000_000)
      .optional(),
  })
  .strict();

export const ModelDisplayMetadataMapSchema = z
  .record(z.string().min(3).max(500), ModelDisplayMetadataSchema)
  .superRefine((metadata, context) => {
    const entries = Object.entries(metadata);
    if (entries.length > 1_000) {
      context.addIssue({
        code: "custom",
        message: "At most 1000 model metadata records may be configured",
      });
    }

    const seen = new Set<string>();
    for (const [key] of entries) {
      const separator = key.indexOf("/");
      if (separator < 1 || separator === key.length - 1) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Model metadata keys must use provider/model format",
        });
        continue;
      }

      const normalized = normalizeModelKey(
        key.slice(0, separator),
        key.slice(separator + 1),
      );
      if (seen.has(normalized)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Model metadata keys must be unique ignoring case",
        });
      }
      seen.add(normalized);
    }
  });

export type ModelDisplayMetadata = z.infer<typeof ModelDisplayMetadataSchema>;
export type ModelDisplayMetadataMap = z.infer<
  typeof ModelDisplayMetadataMapSchema
>;

export const validateModelDisplayMetadataMap = (
  input: unknown,
): ModelDisplayMetadataMap | null => {
  const result = ModelDisplayMetadataMapSchema.safeParse(input);
  return result.success ? result.data : null;
};

export const findModelDisplayMetadata = (
  metadata: ModelDisplayMetadataMap,
  provider: string,
  model: string,
): ModelDisplayMetadata | undefined => {
  const target = normalizeModelKey(provider, model);
  const entry = Object.entries(metadata).find(([key]) => {
    const separator = key.indexOf("/");
    return (
      separator > 0 &&
      normalizeModelKey(key.slice(0, separator), key.slice(separator + 1)) ===
        target
    );
  });
  return entry?.[1];
};
