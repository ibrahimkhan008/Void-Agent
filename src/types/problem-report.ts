import { z } from "zod";

export const PROBLEM_REPORT_DESCRIPTION_MAX = 5_000;
export const PROBLEM_REPORT_SCREENSHOT_MAX = 5;
export const PROBLEM_REPORT_SCREENSHOT_BYTES_MAX = 10 * 1024 * 1024;

const screenshotSchema = z
  .object({
    key: z.string().min(1).max(512),
    name: z.string().trim().min(1).max(255),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    size: z.number().int().positive().max(PROBLEM_REPORT_SCREENSHOT_BYTES_MAX),
  })
  .strict();

const contextSchema = z
  .object({
    pageUrl: z.string().max(2_048).optional(),
    userAgent: z.string().max(512).optional(),
    locale: z.string().max(16).optional(),
    viewport: z.string().max(32).optional(),
  })
  .strict();

export const problemReportInputSchema = z
  .object({
    description: z.string().trim().min(1).max(PROBLEM_REPORT_DESCRIPTION_MAX),
    screenshots: z.array(screenshotSchema).max(PROBLEM_REPORT_SCREENSHOT_MAX).default([]),
    context: contextSchema.optional(),
  })
  .strict();

export type ProblemReportScreenshot = z.infer<typeof screenshotSchema>;
export type ProblemReportContext = z.infer<typeof contextSchema>;
export type ProblemReportInput = z.infer<typeof problemReportInputSchema>;
export type ProblemReportStatus = "open" | "in_review" | "resolved";
