import { google } from "@ai-sdk/google";
import { ModelMessage, tool as createTool } from "ai";
import { generateText } from "ai";
import { isFreeTier } from "app-types/subscription";
import { editImageWithFlare } from "lib/ai/image/edit-image";
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  IMAGE_EDIT_MODEL_MAP,
} from "lib/ai/image/edit-models";
import {
  generateGatewayMultiReferenceImage,
  isGatewayMultiReferenceConfigured,
} from "lib/ai/image/gateway-multi-reference";
import { generateImageWithFlare } from "lib/ai/image/generate-flare-image";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_MODEL_MAP,
} from "lib/ai/image/models";
import { serverFileStorage } from "lib/file-storage";
import {
  canUseFreeTierImageEdit,
  canUseFreeTierImageGeneration,
  getFreeTierLimits,
  recordFreeTierImageEditSuccess,
  recordFreeTierImageGenerationSuccess,
} from "lib/rate-limit/free-tier-usage";
import { isString } from "lib/utils";
import logger from "logger";
import { safe, watchError } from "ts-safe";
import z from "zod";
import { ImageToolName } from "..";
import { inferImageToolMode } from "./image-mode";
import {
  type ImageReference,
  findLatestImageReference,
  findLatestUserImageReferences,
  loadOwnedImageForEdit,
  loadOwnedImageReferencesForEdit,
} from "./image-source";

export type ImageToolResult = {
  images: {
    url: string;
    mimeType?: string;
    originalUrl?: string;
  }[];
  mode?: "create" | "edit" | "composite";
  guide?: string;
  model: string;
  provider?: "flare" | "ai-gateway";
};

/**
 * Extract the latest user prompt from messages for image generation
 */
function extractLatestUserPrompt(messages: ModelMessage[]): string {
  // Look at recent messages to find user's image request
  const recentMessages = messages.slice(-6);
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.role === "user") {
      if (isString(msg.content)) {
        return msg.content;
      }
      // Extract text parts
      const textParts = msg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      if (textParts) return textParts;
    }
  }
  return "A beautiful image";
}

const SIZE_REGEX = /\b(1792x1024|1024x1792|1024x1024)\b/i;

const MODEL_ALIASES: Array<{ regex: RegExp; model: string }> = [
  {
    regex: /\b(nb[\s-]*pro|nbpro|nano[\s-]*banana[\s-]*pro)\b/i,
    model: "nbpro",
  },
  { regex: /\bnano[\s-]*banana\b/i, model: "nano-banana" },
  { regex: /\bimagen?\s*4|img4\b/i, model: "img4" },
  { regex: /\bimagen?\s*3|img3\b/i, model: "img3" },
  { regex: /\bflux\s*schnell\b/i, model: "flux-schnell" },
  { regex: /\bqwen\b/i, model: "qwen" },
  { regex: /\blucid\s*origin\b/i, model: "lucid-origin" },
  { regex: /\bphoenix\b/i, model: "phoenix" },
  { regex: /\bsdxl\s*lite\b/i, model: "sdxl-lite" },
  { regex: /\bsdxl\b/i, model: "sdxl" },
];

const extractRequestedModel = (prompt: string): string | undefined => {
  for (const alias of MODEL_ALIASES) {
    if (alias.regex.test(prompt)) return alias.model;
  }
  return undefined;
};

const normalizeRequestedModel = (requestedModel?: string) => {
  if (!requestedModel) return undefined;
  const normalized = requestedModel.trim().toLowerCase();
  const aliasMatch = extractRequestedModel(normalized);
  if (aliasMatch) return aliasMatch;
  return requestedModel.trim();
};

const extractRequestedModelFromMessages = (
  messages: ModelMessage[],
): string | undefined => {
  const recentMessages = messages.slice(-8);
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const message = recentMessages[i];
    if (message.role !== "user") continue;

    if (isString(message.content)) {
      const model = extractRequestedModel(message.content);
      if (model) return model;
      continue;
    }

    if (!Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part: any) => part?.type === "text")
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ");
    const model = extractRequestedModel(text);
    if (model) return model;
  }
  return undefined;
};

const resolveEditModel = (requestedModel?: string) => {
  const normalizedModel = normalizeRequestedModel(requestedModel);
  if (!normalizedModel) return DEFAULT_IMAGE_EDIT_MODEL;
  if (IMAGE_EDIT_MODEL_MAP[normalizedModel]) return normalizedModel;
  if (normalizedModel === "nbpro" || normalizedModel === "nano-banana") {
    return normalizedModel;
  }
  return DEFAULT_IMAGE_EDIT_MODEL;
};

const resolveGenerationModel = (requestedModel?: string) => {
  const normalizedModel = normalizeRequestedModel(requestedModel);
  if (!normalizedModel) return DEFAULT_IMAGE_GENERATION_MODEL;
  if (IMAGE_GENERATION_MODEL_MAP[normalizedModel]) return normalizedModel;
  return DEFAULT_IMAGE_GENERATION_MODEL;
};

const extractLatestUserImage = (messages: ModelMessage[]) =>
  findLatestImageReference(messages, ImageToolName);

const resolveSizeFromPrompt = (
  prompt: string,
  aspectRatio?: "square" | "landscape" | "portrait",
) => {
  const directSize = prompt.match(SIZE_REGEX)?.[1];
  if (directSize) return directSize;

  if (/\blandscape\b/i.test(prompt)) return "1792x1024";
  if (/\bportrait\b/i.test(prompt)) return "1024x1792";
  if (/\bsquare\b/i.test(prompt)) return "1024x1024";

  if (aspectRatio === "landscape") return "1792x1024";
  if (aspectRatio === "portrait") return "1024x1792";
  return "1024x1024";
};

const isUsableImageReference = (url: string) => {
  const normalized = url.trim();
  if (!normalized) return false;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (normalized.startsWith("/")) return true;
  return false;
};

const createImageRefFromUrl = (url: string): ImageReference | null => {
  const normalized = url.trim();
  if (!isUsableImageReference(normalized)) {
    return null;
  }
  const dataUrlMatch = normalized.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/,
  );
  return {
    url: normalized,
    mimeType: dataUrlMatch?.[1] || "image/png",
  };
};

const fetchImageAsBase64 = async (
  image: ImageReference,
  ownerId: string | undefined,
  abortSignal?: AbortSignal,
) => loadOwnedImageForEdit(image, ownerId, abortSignal);

const uploadGeneratedImages = async (
  images: { base64: string; mimeType?: string; originalUrl?: string }[],
  ownerId?: string,
) => {
  return safe(images)
    .map((values) =>
      Promise.all(
        values.map(async (image) => {
          const uploadedImage = await serverFileStorage.upload(
            Buffer.from(image.base64, "base64"),
            {
              contentType: image.mimeType,
              ownerId,
            },
          );
          return {
            url: uploadedImage.sourceUrl,
            mimeType: image.mimeType,
            originalUrl: image.originalUrl,
          };
        }),
      ),
    )
    .watch(
      watchError((e) => {
        logger.error(e);
        logger.info(`upload image failed`);
      }),
    )
    .ifFail(() => {
      throw new Error(
        "Image generation was successful, but file upload failed. Please check your file upload configuration and try again.",
      );
    })
    .unwrap();
};

const uploadEditedImages = async (
  images: { url: string; base64?: string; mimeType?: string }[],
  ownerId?: string,
) => {
  return safe(images)
    .map((values) =>
      Promise.all(
        values.map(async (image) => {
          if (!image.base64) {
            return {
              url: image.url,
              mimeType: image.mimeType,
              originalUrl: image.url,
            };
          }
          const uploadedImage = await serverFileStorage.upload(
            Buffer.from(image.base64, "base64"),
            {
              contentType: image.mimeType,
              ownerId,
            },
          );
          return {
            url: uploadedImage.sourceUrl,
            mimeType: image.mimeType,
            originalUrl: image.url,
          };
        }),
      ),
    )
    .watch(
      watchError((e) => {
        logger.error(e);
        logger.info(`upload edited image failed`);
      }),
    )
    .ifFail(() => {
      throw new Error(
        "Image edit was successful, but file upload failed. Please check your file upload configuration and try again.",
      );
    })
    .unwrap();
};

/**
 * Create a Flare API image generation tool with optional model and size override
 */
export function createFlareImageTool(
  modelId?: string,
  optimize: boolean = false,
  size?: string,
  executionContext?: {
    userId?: string;
    userTier?: string | null;
  },
) {
  const targetModel = modelId || DEFAULT_IMAGE_GENERATION_MODEL;

  return createTool({
    name: ImageToolName,
    description: `Generate or edit images. Use mode='edit' to modify one uploaded image. Use mode='composite' only when the user explicitly asks to combine multiple uploaded images; multiple attachments alone do not imply composition. Composition requires AI Gateway configuration. Model aliases: "nano banana pro" = "nbpro" and "nano banana" = "nano-banana". You can infer model/size from prompt (e.g. square/portrait/landscape).`,
    inputSchema: z.object({
      prompt: z
        .string()
        .optional()
        .describe(
          "Prompt for image generation or editing. If omitted, inferred from recent conversation.",
        ),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe(
          "Aspect ratio hint. Used when explicit size is not provided.",
        ),
      mode: z
        .enum(["create", "edit", "composite"])
        .optional()
        .describe(
          "Mode of operation. Use edit to modify one uploaded image. Use composite only when explicitly combining 2–4 uploaded images.",
        ),
      model: z
        .string()
        .optional()
        .describe(
          "Optional model id/name. Examples: nbpro (nano banana pro), nano-banana (nano banana).",
        ),
      image_url: z
        .string()
        .optional()
        .describe(
          "Direct URL (or data URL) of the source image for edit mode.",
        ),
      size: z
        .enum(["1024x1024", "1792x1024", "1024x1792"])
        .optional()
        .describe(
          "Explicit output size. If provided, this overrides aspect_ratio.",
        ),
    }),
    execute: async (
      {
        prompt,
        mode: inputMode,
        aspect_ratio: inputAspectRatio,
        model: inputModel,
        image_url: inputImageUrl,
        size: inputSize,
      },
      { messages, abortSignal },
    ) => {
      try {
        // Use provided prompt or extract from messages
        const latestUserPrompt = extractLatestUserPrompt(messages);
        let finalPrompt = prompt || latestUserPrompt;
        const explicitImageRef = inputImageUrl?.trim()
          ? createImageRefFromUrl(inputImageUrl)
          : null;
        if (inputImageUrl?.trim() && !explicitImageRef) {
          logger.warn(
            `Ignoring invalid image_url tool input: ${inputImageUrl.trim()}`,
          );
        }
        const latestUserImage =
          explicitImageRef || extractLatestUserImage(messages);
        const gatewayImageReferences = explicitImageRef
          ? [explicitImageRef]
          : findLatestUserImageReferences(messages);

        const mode = inferImageToolMode(
          inputMode,
          finalPrompt,
          Boolean(latestUserImage),
        );
        const userId = executionContext?.userId;
        const enforceFreeLimits =
          Boolean(userId) && isFreeTier(executionContext?.userTier);

        const requestedModel =
          extractRequestedModel(prompt || "") ||
          extractRequestedModel(latestUserPrompt) ||
          extractRequestedModelFromMessages(messages) ||
          normalizeRequestedModel(inputModel);
        const resolvedSize =
          size ||
          inputSize ||
          resolveSizeFromPrompt(finalPrompt, inputAspectRatio || "square");

        if (mode === "composite") {
          if (gatewayImageReferences.length < 2) {
            throw new Error(
              "Image composition requires at least two images uploaded in the same message.",
            );
          }
          if (!isGatewayMultiReferenceConfigured()) {
            throw new Error(
              "Combining multiple images is not configured. Set AI_GATEWAY_API_KEY to enable this feature.",
            );
          }
          if (enforceFreeLimits && userId) {
            const check = await canUseFreeTierImageEdit(userId);
            if (!check.allowed) {
              const limits = await getFreeTierLimits();
              throw new Error(
                `Free plan allows ${limits.dailyImageEdits} image edits per day. Upgrade to continue.`,
              );
            }
          }

          const references = await loadOwnedImageReferencesForEdit(
            gatewayImageReferences,
            userId,
            abortSignal,
          );
          const composite = await generateGatewayMultiReferenceImage({
            prompt: finalPrompt,
            images: references,
            abortSignal,
          });
          const resultImages = await uploadEditedImages(
            composite.images,
            userId,
          );
          if (enforceFreeLimits && userId && resultImages.length > 0) {
            await recordFreeTierImageEditSuccess(userId);
          }

          return {
            images: resultImages,
            mode: "composite",
            model: composite.model,
            provider: "ai-gateway",
            guide: `Image composition completed with ${composite.model}.`,
          } as ImageToolResult;
        }

        if (mode === "edit") {
          if (enforceFreeLimits && userId) {
            const check = await canUseFreeTierImageEdit(userId);
            if (!check.allowed) {
              const limits = await getFreeTierLimits();
              throw new Error(
                `Free plan allows ${limits.dailyImageEdits} image edits per day. Upgrade to continue.`,
              );
            }
          }

          if (!latestUserImage) {
            throw new Error(
              "Please upload an image first, then ask for edits.",
            );
          }

          const selectedEditModel = resolveEditModel(
            requestedModel || modelId || targetModel,
          );
          const editProvider =
            IMAGE_EDIT_MODEL_MAP[selectedEditModel]?.provider || "flare";
          const imagePayload = await fetchImageAsBase64(
            latestUserImage,
            userId,
            abortSignal,
          );

          logger.info(
            `Editing image: model=${selectedEditModel}, provider=${editProvider}, size=${resolvedSize}`,
          );

          const editResult = await editImageWithFlare({
            imageBase64: imagePayload.base64,
            imageMimeType: imagePayload.mimeType,
            prompt: finalPrompt,
            model: selectedEditModel,
            size: resolvedSize,
            abortSignal,
          });

          const resultImages = await uploadEditedImages(
            editResult.images,
            userId,
          );
          if (enforceFreeLimits && userId && resultImages.length > 0) {
            await recordFreeTierImageEditSuccess(userId);
          }

          return {
            images: resultImages,
            mode: "edit",
            model: selectedEditModel,
            provider: editProvider,
            guide:
              resultImages.length > 0
                ? `Image edited successfully with ${selectedEditModel}.`
                : "Image edit failed. Please try again.",
          } as ImageToolResult;
        }

        const selectedGenerationModel = resolveGenerationModel(
          requestedModel || modelId || targetModel,
        );
        if (enforceFreeLimits && userId) {
          const check = await canUseFreeTierImageGeneration(userId);
          if (!check.allowed) {
            const limits = await getFreeTierLimits();
            throw new Error(
              `Free plan allows ${limits.dailyImageGenerations} image generations per day. Upgrade to continue.`,
            );
          }
        }
        const modelDetails =
          IMAGE_GENERATION_MODEL_MAP[selectedGenerationModel] ||
          IMAGE_GENERATION_MODEL_MAP[DEFAULT_IMAGE_GENERATION_MODEL];

        if (optimize) {
          logger.info(`Optimizing prompt with Gemini 2.5 Flash Lite...`);
          try {
            const { text } = await generateText({
              model: google("gemini-2.5-flash-lite"),
              system:
                "You are an expert prompt engineer for AI image generation models. Your task is to analyze the user's request and generate a highly detailed, improved prompt that will result in the best possible image. Focus on visual details, style, lighting, and composition. Output ONLY the refined prompt text, no explanations.",
              prompt: finalPrompt,
            });
            if (text) {
              logger.info(`Optimized prompt: ${text.substring(0, 50)}...`);
              finalPrompt = text;
            }
          } catch (err) {
            logger.error("Prompt optimization failed", err);
            // Continue with original prompt if optimization fails
          }
        }

        logger.info(
          `Generating image with Flare API (${selectedGenerationModel}): ${finalPrompt.substring(0, 50)}...`,
        );

        const imageSize = resolvedSize;

        const result = await generateImageWithFlare({
          prompt: finalPrompt,
          model: selectedGenerationModel,
          size: imageSize,
          abortSignal,
        });

        const resultImages = await uploadGeneratedImages(result.images, userId);
        if (enforceFreeLimits && userId && resultImages.length > 0) {
          await recordFreeTierImageGenerationSuccess(userId);
        }

        return {
          images: resultImages,
          mode: "create",
          model: selectedGenerationModel,
          provider: "flare",
          guide:
            resultImages.length > 0
              ? `Image generated successfully with ${modelDetails?.name || selectedGenerationModel}. The image is displayed above.`
              : "Image generation failed. Please try again with a different prompt or model.",
        } as ImageToolResult;
      } catch (e) {
        logger.error(e);
        throw e;
      }
    },
  });
}

// Default Flare API tool
export const flareImageTool = createFlareImageTool();

// Alias for backward compatibility
export const nanoBananaTool = createFlareImageTool();
export const createNanoBananaTool = (optimize: boolean = false) =>
  createFlareImageTool("nbpro", optimize);
