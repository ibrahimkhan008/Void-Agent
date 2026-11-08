import "server-only";

import { createGatewayProvider } from "@ai-sdk/gateway-image-v4";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { generateImage } from "ai-image-v7";
import { validateProviderImageBytes } from "./provider-image";

export const GATEWAY_INPAINT_MODEL = "bfl/flux-pro-1.0-fill";
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_EDGE = 8_192;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_EDGE = 1_536;
const MAX_PROMPT_CHARS = 600;

export class GatewayInpaintInputError extends Error {}
export class GatewayInpaintProviderError extends Error {}

export function isGatewayInpaintConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

function decodeCanonicalBase64(value: unknown, label: string): Buffer {
  if (typeof value !== "string" || value.length % 4 !== 0) {
    throw new Error(`${label} is malformed.`);
  }
  if (value.length > Math.ceil((MAX_INPUT_BYTES * 4) / 3)) {
    throw new Error(`${label} exceeds the 15 MiB limit.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.byteLength === 0) {
    throw new Error(`${label} is malformed.`);
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`${label} exceeds the 15 MiB limit.`);
  }
  return bytes;
}

export async function normalizeInpaintPair(
  sourceValue: string,
  maskValue: string,
  sourceMimeType: string,
) {
  const rawSource = decodeCanonicalBase64(sourceValue, "Source image");
  const rawMask = decodeCanonicalBase64(maskValue, "Image mask");
  if (rawSource.byteLength + rawMask.byteLength > MAX_INPUT_BYTES) {
    throw new Error("Source image and mask exceed the combined 15 MiB limit.");
  }
  const source = validateProviderImageBytes(rawSource, sourceMimeType);
  const mask = validateProviderImageBytes(rawMask);
  const [sourceImage, maskImage] = await Promise.all([
    loadImage(Buffer.from(source.base64, "base64")),
    loadImage(Buffer.from(mask.base64, "base64")),
  ]);
  for (const [label, image] of [
    ["Source image", sourceImage],
    ["Image mask", maskImage],
  ] as const) {
    if (
      image.width < 1 ||
      image.height < 1 ||
      image.width > MAX_INPUT_EDGE ||
      image.height > MAX_INPUT_EDGE ||
      image.width * image.height > MAX_INPUT_PIXELS
    ) {
      throw new Error(`${label} dimensions exceed the inpainting limit.`);
    }
  }

  const scale = Math.min(
    1,
    MAX_OUTPUT_EDGE / Math.max(sourceImage.width, sourceImage.height),
  );
  const width = Math.max(1, Math.round(sourceImage.width * scale));
  const height = Math.max(1, Math.round(sourceImage.height * scale));
  const imageCanvas = createCanvas(width, height);
  const imageContext = imageCanvas.getContext("2d");
  imageContext.drawImage(sourceImage, 0, 0, width, height);

  const maskCanvas = createCanvas(width, height);
  const maskContext = maskCanvas.getContext("2d");
  maskContext.drawImage(maskImage, 0, 0, width, height);
  const pixels = maskContext.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const isPainted = pixels.data[index + 3]! > 0;
    const value = isPainted ? 255 : 0;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 255;
  }
  maskContext.putImageData(pixels, 0, 0);

  const normalizedSource = imageCanvas.toBuffer("image/png");
  const normalizedMask = maskCanvas.toBuffer("image/png");
  if (
    normalizedSource.byteLength + normalizedMask.byteLength >
    MAX_INPUT_BYTES
  ) {
    throw new Error(
      "Normalized image and mask exceed the combined 15 MiB limit.",
    );
  }
  return {
    image: new Uint8Array(normalizedSource),
    mask: new Uint8Array(normalizedMask),
    width,
    height,
  };
}

export async function generateGatewayInpaint(args: {
  imageBase64: string;
  maskBase64: string;
  imageMimeType: string;
  prompt: string;
  abortSignal?: AbortSignal;
}) {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new GatewayInpaintInputError(
      "Masked image edits require AI_GATEWAY_API_KEY to be configured.",
    );
  }
  const prompt = args.prompt
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROMPT_CHARS)
    .trim();
  if (!prompt) {
    throw new GatewayInpaintInputError(
      "Describe what should replace the masked area.",
    );
  }

  let pair: Awaited<ReturnType<typeof normalizeInpaintPair>>;
  try {
    pair = await normalizeInpaintPair(
      args.imageBase64,
      args.maskBase64,
      args.imageMimeType,
    );
  } catch (error) {
    throw new GatewayInpaintInputError(
      error instanceof Error ? error.message : "Invalid image/mask input.",
    );
  }
  args.abortSignal?.throwIfAborted();
  let result;
  try {
    result = await generateImage({
      model: createGatewayProvider({ apiKey }).imageModel(
        GATEWAY_INPAINT_MODEL,
      ),
      prompt: {
        text: prompt,
        images: [pair.image],
        mask: pair.mask,
      },
      n: 1,
      maxRetries: 0,
      abortSignal: args.abortSignal,
    });
  } catch {
    if (args.abortSignal?.aborted) throw args.abortSignal.reason;
    throw new GatewayInpaintProviderError("Image inpainting provider failed.");
  }
  if (result.images.length !== 1) {
    throw new GatewayInpaintProviderError(
      "Image inpainting provider returned an invalid result.",
    );
  }
  let images;
  try {
    images = result.images.map((image) =>
      validateProviderImageBytes(
        Buffer.from(image.base64, "base64"),
        image.mediaType,
      ),
    );
  } catch {
    throw new GatewayInpaintProviderError(
      "Image inpainting provider returned an invalid result.",
    );
  }
  return {
    images: images.map((image) => ({ url: "", ...image })),
    model: GATEWAY_INPAINT_MODEL,
  };
}
