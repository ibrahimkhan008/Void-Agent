import "server-only";

import { createGatewayProvider } from "@ai-sdk/gateway-image-v4";
import { generateImage } from "ai-image-v7";
import { validateProviderImageBytes } from "./provider-image";

export const GATEWAY_MULTI_REFERENCE_MODEL = "bfl/flux-2-pro";
export const GATEWAY_MULTI_REFERENCE_MAX_IMAGES = 4;
const MAX_TOTAL_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_PROMPT_CHARS = 600;

export function isGatewayMultiReferenceConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

/**
 * Optional AI Gateway path for the explicit multi-reference capability.
 * Flare remains the default for image creation and single-source edits.
 */
export async function generateGatewayMultiReferenceImage(args: {
  prompt: string;
  images: { base64: string; mimeType: string }[];
  abortSignal?: AbortSignal;
}) {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Combining multiple images requires AI_GATEWAY_API_KEY to be configured.",
    );
  }
  if (
    args.images.length < 2 ||
    args.images.length > GATEWAY_MULTI_REFERENCE_MAX_IMAGES
  ) {
    throw new Error("Image composition accepts 2 to 4 reference images.");
  }

  let totalInputBytes = 0;
  const validatedImages = args.images.map((image) => {
    if (typeof image.base64 !== "string" || image.base64.length % 4 !== 0) {
      throw new Error("A reference image is malformed.");
    }
    const maxEncodedLength = Math.ceil((MAX_TOTAL_INPUT_BYTES * 4) / 3);
    if (image.base64.length > maxEncodedLength) {
      throw new Error("Combined reference images exceed the 15 MiB limit.");
    }
    const bytes = Buffer.from(image.base64, "base64");
    if (bytes.toString("base64") !== image.base64) {
      throw new Error("A reference image is malformed.");
    }
    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > MAX_TOTAL_INPUT_BYTES) {
      throw new Error("Combined reference images exceed the 15 MiB limit.");
    }
    return validateProviderImageBytes(bytes, image.mimeType);
  });

  const sanitizedPrompt = args.prompt
    .replace(/The <attachment> blocks below[^\n]*/gi, " ")
    .replace(/<attachment\b[\s\S]*?<\/attachment>/gi, " ")
    .replace(/Attached files:\n(?:\s*\d+\..*\n?)*/gi, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IMAGE_PROMPT_CHARS)
    .trim();

  const gateway = createGatewayProvider({ apiKey });
  const result = await generateImage({
    model: gateway.imageModel(GATEWAY_MULTI_REFERENCE_MODEL),
    prompt: {
      text:
        sanitizedPrompt ||
        "Compose a new image using the provided reference images.",
      images: validatedImages.map((image) =>
        Buffer.from(image.base64, "base64"),
      ),
    },
    n: 1,
    maxRetries: 0,
    abortSignal: args.abortSignal,
  });

  if (result.images.length > 1) {
    throw new Error("AI Gateway returned more images than requested.");
  }
  const images = result.images.map((image) =>
    validateProviderImageBytes(
      Buffer.from(image.base64, "base64"),
      image.mediaType,
    ),
  );
  if (images.length === 0) {
    throw new Error("AI Gateway returned no composed image.");
  }
  return {
    images: images.map((image) => ({ url: "", ...image })),
    model: GATEWAY_MULTI_REFERENCE_MODEL,
  };
}
