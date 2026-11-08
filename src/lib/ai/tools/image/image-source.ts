import "server-only";

import { serverFileStorage } from "lib/file-storage";
import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_REFERENCES = 4;

const DATA_IMAGE_RE =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i;

export type ImageReference = {
  url: string;
  mimeType: string;
};

export type LoadedImage = {
  base64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

const ATTACHED_IMAGE_URL_RE = /\[Attached image URL:\s*([^\]]+)\]/gi;

function imageReferenceFromFilePart(part: unknown): ImageReference | null {
  if (typeof part !== "object" || part === null) return null;
  const file = part as Record<string, unknown>;
  if (file.type !== "file") return null;
  const mimeType =
    typeof file.mediaType === "string" ? file.mediaType : "image/png";
  if (!mimeType.startsWith("image/")) return null;
  const data = file.data instanceof URL ? file.data.toString() : file.data;
  const url =
    typeof file.url === "string"
      ? file.url
      : typeof data === "string"
        ? data
        : data instanceof Uint8Array && data.byteLength <= MAX_IMAGE_BYTES
          ? `data:${mimeType};base64,${Buffer.from(data).toString("base64")}`
          : "";
  return url ? { url, mimeType } : null;
}

/**
 * Select the newest user-uploaded or previously generated image in a chat
 * history. A tool result is considered only when it came from this image
 * tool, so unrelated tool URLs never become image-edit inputs.
 */
export function findLatestImageReference(
  messages: readonly unknown[],
  imageToolName: string,
): ImageReference | null {
  for (const message of [...messages].reverse()) {
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    const role = record.role;
    const content = Array.isArray(record.content) ? record.content : [];

    if (role === "user") {
      if (typeof record.content === "string") {
        const matches = Array.from(
          record.content.matchAll(ATTACHED_IMAGE_URL_RE),
        );
        const url = matches.at(-1)?.[1]?.trim();
        if (url) return { url, mimeType: "image/png" };
        continue;
      }
      for (const part of [...content].reverse()) {
        const image = imageReferenceFromFilePart(part);
        if (image) return image;
        if (typeof part === "object" && part !== null) {
          const text = (part as Record<string, unknown>).text;
          if (typeof text === "string") {
            const matches = Array.from(text.matchAll(ATTACHED_IMAGE_URL_RE));
            const url = matches.at(-1)?.[1]?.trim();
            if (url) return { url, mimeType: "image/png" };
          }
        }
      }
      continue;
    }

    for (const part of [...content].reverse()) {
      if (typeof part !== "object" || part === null) continue;
      const candidate = part as Record<string, unknown>;
      if (candidate.toolName !== imageToolName) continue;
      const generated = extractGeneratedImageReference(candidate);
      if (generated) return generated;
    }
  }
  return null;
}

/** Select a bounded set of distinct images uploaded in the latest user turn. */
export function findLatestUserImageReferences(
  messages: readonly unknown[],
  maximum = MAX_IMAGE_REFERENCES,
): ImageReference[] {
  const latestUser = [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>).role === "user",
    );
  if (!latestUser || typeof latestUser !== "object") return [];

  const record = latestUser as Record<string, unknown>;
  const refs: ImageReference[] = [];
  const seen = new Set<string>();
  const add = (image: ImageReference | null) => {
    if (!image || seen.has(image.url) || refs.length >= maximum) return;
    seen.add(image.url);
    refs.push(image);
  };

  if (typeof record.content === "string") {
    for (const match of record.content.matchAll(ATTACHED_IMAGE_URL_RE)) {
      add({ url: match[1]!.trim(), mimeType: "image/png" });
      if (refs.length >= maximum) break;
    }
  } else if (Array.isArray(record.content)) {
    for (const part of record.content) {
      add(imageReferenceFromFilePart(part));
      if (refs.length >= maximum) break;
      if (typeof part === "object" && part !== null) {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") {
          for (const match of text.matchAll(ATTACHED_IMAGE_URL_RE)) {
            add({ url: match[1]!.trim(), mimeType: "image/png" });
            if (refs.length >= maximum) break;
          }
        }
      }
      if (refs.length >= maximum) break;
    }
  }
  return refs;
}

function sniffRasterImage(buffer: Buffer): LoadedImage["mimeType"] | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function finishImage(buffer: Buffer): LoadedImage {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is empty or exceeds the 15 MiB edit limit.");
  }
  const mimeType = sniffRasterImage(buffer);
  if (!mimeType) {
    throw new Error("Only PNG, JPEG, WebP, and GIF images can be edited.");
  }
  return { base64: buffer.toString("base64"), mimeType };
}

/**
 * Resolve an edit source without fetching a caller-controlled URL. Stored
 * image sources must identify an owned managed key; inline sources must be a
 * small, well-formed raster data URL. This keeps model-provided image_url
 * values from becoming an SSRF primitive.
 */
export async function loadOwnedImageForEdit(
  image: ImageReference,
  ownerId: string | undefined,
  signal?: AbortSignal,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<LoadedImage> {
  signal?.throwIfAborted();

  const dataMatch = DATA_IMAGE_RE.exec(image.url);
  if (dataMatch) {
    if (image.url.length > Math.ceil((maxBytes * 4) / 3) + 64) {
      throw new Error("Image is empty or exceeds the 15 MiB edit limit.");
    }
    const encoded = dataMatch[2];
    if (encoded.length % 4 !== 0) {
      throw new Error("The inline image is malformed.");
    }
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.byteLength > maxBytes) {
      throw new Error("Combined reference images exceed the 15 MiB limit.");
    }
    signal?.throwIfAborted();
    return finishImage(buffer);
  }

  if (
    !ownerId ||
    (!image.url.startsWith("/") && !/^https:\/\//i.test(image.url))
  ) {
    throw new Error("Please use an image uploaded to this account.");
  }

  const key = storageKeyFromUrl(image.url);
  if (!key || !isManagedStorageKey(key) || !isUserStorageKey(key, ownerId)) {
    throw new Error("Please use an image uploaded to this account.");
  }

  const metadata = await serverFileStorage.getMetadata(key);
  if (!metadata) throw new Error("The uploaded image is no longer available.");
  if (metadata.size > maxBytes) {
    throw new Error("Image is empty or exceeds the 15 MiB edit limit.");
  }
  const buffer = await serverFileStorage.downloadLimited(key, maxBytes);
  signal?.throwIfAborted();
  return finishImage(buffer);
}

/** Load 2–4 owner-controlled images under one combined 15 MiB budget. */
export async function loadOwnedImageReferencesForEdit(
  images: ImageReference[],
  ownerId: string | undefined,
  signal?: AbortSignal,
): Promise<LoadedImage[]> {
  if (images.length < 2 || images.length > MAX_IMAGE_REFERENCES || !ownerId) {
    throw new Error("Image composition requires 2 to 4 account-owned images.");
  }

  const loaded: LoadedImage[] = [];
  let remainingBytes = MAX_IMAGE_BYTES;
  for (const image of images) {
    signal?.throwIfAborted();
    const next = await loadOwnedImageForEdit(
      image,
      ownerId,
      signal,
      remainingBytes,
    );
    const bytes = Buffer.from(next.base64, "base64").byteLength;
    remainingBytes -= bytes;
    if (remainingBytes < 0) {
      throw new Error("Combined reference images exceed the 15 MiB limit.");
    }
    loaded.push(next);
  }
  return loaded;
}

/** Extract image references from a previous image-tool result. */
export function extractGeneratedImageReference(
  value: unknown,
): ImageReference | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const output = record.output;
  const normalizedOutput =
    typeof output === "object" && output !== null && "value" in output
      ? (output as { value?: unknown }).value
      : output;
  if (typeof normalizedOutput !== "object" || normalizedOutput === null) {
    return null;
  }
  const images = (normalizedOutput as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index] as Record<string, unknown> | null;
    if (
      image &&
      typeof image.url === "string" &&
      image.url.length <= 4096 &&
      typeof image.mimeType === "string" &&
      image.mimeType.startsWith("image/")
    ) {
      return { url: image.url, mimeType: image.mimeType };
    }
  }
  return null;
}

export const IMAGE_EDIT_MAX_BYTES = MAX_IMAGE_BYTES;
