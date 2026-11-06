import { z } from "zod";

export const MAX_PUBLISHED_PAGE_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_PUBLISHED_PAGE_REQUEST_BYTES = 4 * 1024 * 1024;

export const publishPageSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    html: z.string().min(1).max(MAX_PUBLISHED_PAGE_HTML_BYTES),
    slug: z.string().max(64).optional(),
  })
  .strict();

export type PublishPageInput = z.infer<typeof publishPageSchema>;
