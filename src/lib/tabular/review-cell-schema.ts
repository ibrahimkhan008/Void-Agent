import { z } from "zod";

export const reviewCellUpdateSchema = z.object({
  itemId: z.string().uuid(),
  columnId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  value: z.string().max(4_000),
});

export const reviewCellRegenerationSchema = reviewCellUpdateSchema
  .pick({
    itemId: true,
    columnId: true,
  })
  .strict();

export const reviewGenerationRequestSchema = z.union([
  reviewCellRegenerationSchema,
  z.object({ force: z.literal(true) }).strict(),
]);

export type ReviewCellUpdate = z.infer<typeof reviewCellUpdateSchema>;
export type ReviewCellRegeneration = z.infer<
  typeof reviewCellRegenerationSchema
>;
export type ReviewGenerationRequest = z.infer<
  typeof reviewGenerationRequestSchema
>;

export async function readBoundedJson(
  request: Request,
  maxBytes = 8_192,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; reason: "too-large" | "invalid-json" }
> {
  if (!request.body) return { ok: false, reason: "invalid-json" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown,
    };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}

export function isReviewCellInScope(
  cells: readonly { itemId: string; columnId: string }[],
  target: ReviewCellRegeneration,
) {
  return cells.some(
    (cell) =>
      cell.itemId === target.itemId && cell.columnId === target.columnId,
  );
}
