import type { UIMessage } from "ai";
import { z } from "zod";

const IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/iu;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_MESSAGE_TEXT = 40_000;

const canvasMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.union([
      z.string().max(MAX_MESSAGE_TEXT),
      z.array(z.unknown()).max(100),
    ]),
  })
  .strict();

export const CanvasGenerateRequestSchema = z
  .object({
    model: z
      .object({
        provider: z.string().trim().min(1).max(120),
        model: z.string().trim().min(1).max(240),
      })
      .strict(),
    messages: z.array(canvasMessageSchema).min(1).max(64),
  })
  .strict()
  .superRefine(({ messages }, ctx) => {
    let textLength = 0;
    for (const message of messages) {
      if (typeof message.content === "string") {
        textLength += message.content.length;
        continue;
      }
      for (const part of message.content) {
        if (
          isRecord(part) &&
          part.type === "text" &&
          typeof part.text === "string"
        ) {
          textLength += part.text.length;
        }
      }
    }
    if (textLength > 160_000) {
      ctx.addIssue({ code: "custom", message: "Canvas prompt is too large" });
    }
  });

type CanvasMessage = z.infer<typeof canvasMessageSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function imageDataUrl(
  value: string,
): { url: string; mediaType: string } | null {
  if (value.length > (MAX_IMAGE_BYTES * 4) / 3 + 128) return null;
  const match = IMAGE_DATA_URL.exec(value);
  if (!match) return null;
  const mediaType = match[1].toLowerCase().replace("jpg", "jpeg");
  const data = match[2].replace(/\s/gu, "");
  if (Buffer.from(data, "base64").byteLength > MAX_IMAGE_BYTES) return null;
  return { url: `data:${mediaType};base64,${data}`, mediaType };
}

export function toCanvasUIMessage(
  message: CanvasMessage,
  id: string,
): UIMessage {
  if (typeof message.content === "string") {
    return {
      id,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    };
  }

  const parts: UIMessage["parts"] = [];
  for (const part of message.content) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ type: "text", text: part.text.slice(0, MAX_MESSAGE_TEXT) });
      continue;
    }

    let image: { url: string; mediaType: string } | null = null;
    if (
      part.type === "image" &&
      isRecord(part.source) &&
      typeof part.source.data === "string" &&
      typeof part.source.media_type === "string"
    ) {
      image = imageDataUrl(
        `data:${part.source.media_type};base64,${part.source.data}`,
      );
    } else if (part.type === "image_url" && isRecord(part.image_url)) {
      if (typeof part.image_url.url !== "string") {
        throw new Error("Invalid canvas image");
      }
      image = imageDataUrl(part.image_url.url);
    }

    if (part.type === "image" || part.type === "image_url") {
      if (!image)
        throw new Error("Canvas images must be bounded base64 image data");
      parts.push({
        type: "file",
        filename: "canvas-image",
        mediaType: image.mediaType,
        url: image.url,
      });
    }
  }
  return { id, role: message.role, parts };
}

export type { CanvasMessage };
