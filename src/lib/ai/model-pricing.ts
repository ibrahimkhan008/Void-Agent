import { z } from "zod";

const PriceEntrySchema = z.object({
  inputMicrosPerMillion: z.number().int().min(0).max(1_000_000_000_000),
  outputMicrosPerMillion: z.number().int().min(0).max(1_000_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const ModelPricingMapSchema = z
  .record(z.string().min(3).max(300), PriceEntrySchema)
  .superRefine((prices, context) => {
    if (Object.keys(prices).length > 1_000) {
      context.addIssue({
        code: "custom",
        message: "At most 1000 model prices may be configured",
      });
      return;
    }
    const seen = new Set<string>();
    for (const key of Object.keys(prices)) {
      const separator = key.indexOf("/");
      if (separator < 1 || separator === key.length - 1) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Model pricing keys must use provider/model format",
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
          message: "Model pricing keys must be unique ignoring case",
        });
      }
      seen.add(normalized);
    }
  });

export type ModelPrice = z.infer<typeof PriceEntrySchema>;
export type ModelPricingMap = z.infer<typeof ModelPricingMapSchema>;

export const normalizeModelKey = (provider: string, model: string) =>
  `${provider.trim().toLowerCase()}/${model.trim().toLowerCase()}`;

export const findModelPrice = (
  pricing: ModelPricingMap,
  provider: string,
  model: string,
): ModelPrice | undefined => {
  const key = normalizeModelKey(provider, model);
  const match = Object.entries(pricing).find(([configuredKey]) => {
    const separator = configuredKey.indexOf("/");
    return (
      separator > 0 &&
      normalizeModelKey(
        configuredKey.slice(0, separator),
        configuredKey.slice(separator + 1),
      ) === key
    );
  });
  return match?.[1];
};

export const calculateCostMicros = (
  input: {
    inputTokens: number;
    outputTokens: number;
  },
  price: ModelPrice,
): number => {
  if (
    !Number.isSafeInteger(input.inputTokens) ||
    input.inputTokens < 0 ||
    !Number.isSafeInteger(input.outputTokens) ||
    input.outputTokens < 0
  ) {
    throw new Error("Invalid model token usage");
  }
  const cost = Math.ceil(
    (input.inputTokens * price.inputMicrosPerMillion +
      input.outputTokens * price.outputMicrosPerMillion) /
      1_000_000,
  );
  if (!Number.isSafeInteger(cost)) {
    throw new Error("Model usage cost exceeds the supported range");
  }
  return cost;
};

export const estimateCostMicros = (
  promptCharacters: number,
  price: ModelPrice,
): number => {
  if (!Number.isSafeInteger(promptCharacters) || promptCharacters < 0) {
    throw new Error("Invalid prompt size for cost estimate");
  }
  // Keep the same conservative estimate used by the reference workflow:
  // roughly one input token per four serialized characters plus 4096 output
  // tokens. Actual provider usage replaces this estimate at stream finish.
  const inputTokens = Math.ceil(promptCharacters / 4);
  return calculateCostMicros({ inputTokens, outputTokens: 4096 }, price);
};
