import { z } from "zod";

export const MAX_CANVAS_EXPORT_HTML_BYTES = 512 * 1024;
export const MAX_CANVAS_EXPORT_SCENE_BYTES = 2 * 1024 * 1024;
export const MAX_CANVAS_EXPORT_REQUEST_BYTES = 3 * 1024 * 1024;

export type CanvasExportScene = {
  elements?: unknown[];
  files?: Record<string, unknown>;
};

export type CanvasExportMetadata = {
  modelId?: string;
  modelLabel?: string;
  providerName?: string;
  usage?: {
    input_tokens?: number | string;
    output_tokens?: number | string;
  };
  generatedAt?: string;
  canvasVersion?: number;
  iteration?: number;
};

export type CanvasExport = {
  id: string;
  exporterId: string;
  canvasId: string;
  title: string;
  html: string;
  scene?: CanvasExportScene | null;
  metadata?: CanvasExportMetadata | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date | null;
};

export type CanvasExportPublic = {
  id: string;
  title: string;
  html: string;
  canvasId: string;
  createdAt: Date;
  metadata?: CanvasExportMetadata | null;
  exporterName: string | null;
  exporterImage?: string | null;
};

export type CanvasExportSummary = {
  id: string;
  title: string;
  canvasId: string;
  createdAt: Date;
  revokedAt?: Date;
};

const sceneSchema = z
  .object({
    elements: z.array(z.unknown()).max(20_000).optional(),
    files: z.record(z.string().max(200), z.unknown()).optional(),
  })
  .strict()
  .superRefine((scene, ctx) => {
    const bytes = new TextEncoder().encode(JSON.stringify(scene)).byteLength;
    if (bytes > MAX_CANVAS_EXPORT_SCENE_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "Canvas scene exceeds its size limit",
      });
    }
  });

const metadataSchema = z
  .object({
    modelId: z.string().max(200).optional(),
    modelLabel: z.string().max(200).optional(),
    providerName: z.string().max(200).optional(),
    usage: z
      .object({
        input_tokens: z
          .union([z.number().finite(), z.string().max(32)])
          .optional(),
        output_tokens: z
          .union([z.number().finite(), z.string().max(32)])
          .optional(),
      })
      .strict()
      .optional(),
    generatedAt: z.string().max(64).optional(),
    canvasVersion: z.number().int().min(0).max(100_000).optional(),
    iteration: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

const boundedHtml = z
  .string()
  .min(1)
  .refine(
    (html) =>
      new TextEncoder().encode(html).byteLength <= MAX_CANVAS_EXPORT_HTML_BYTES,
    `HTML exceeds the ${MAX_CANVAS_EXPORT_HTML_BYTES} byte limit`,
  );

export const CanvasExportCreateRequestSchema = z
  .object({
    canvasId: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(200).optional(),
    html: boundedHtml,
    scene: sceneSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const CanvasExportIdSchema = z.string().uuid();

export type CanvasExportRepository = {
  insert(data: {
    exporterId: string;
    canvasId: string;
    title: string;
    html: string;
    scene?: CanvasExportScene;
    metadata?: CanvasExportMetadata;
  }): Promise<string>;
  selectByIdPublic(id: string): Promise<CanvasExportPublic | null>;
  selectSummaryByExporterId(exporterId: string): Promise<CanvasExportSummary[]>;
  selectByIdForZip(id: string): Promise<CanvasExport | null>;
  revokeById(id: string, exporterId: string): Promise<boolean>;
};
