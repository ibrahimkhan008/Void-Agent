export const MORPHIK_IMAGE_HOSTS = new Set([
  "morphik-storage.s3.amazonaws.com",
  "s3.amazonaws.com",
]);

const MAX_BLOCK_LENGTH = 64 * 1024;
const MAX_URL_LENGTH = 4_096;
const MAX_TITLE_LENGTH = 180;
const MAX_PREVIEWS = 8;

export interface MorphikImagePreview {
  url?: string;
  previewRef?: string;
  title: string;
  score?: number;
  docUrl?: string;
}

export function validateMorphikImageUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_URL_LENGTH ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      (url.port && url.port !== "443") ||
      url.username ||
      url.password ||
      url.hash ||
      !MORPHIK_IMAGE_HOSTS.has(url.hostname.toLowerCase())
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeDocUrl(value: string | undefined): string | undefined {
  if (
    !value ||
    value.length > MAX_URL_LENGTH ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeTitle(value: string | undefined, index: number): string {
  const title = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return title || `Image result ${index + 1}`;
}

export function parseMorphikImagePreviews(
  value: unknown,
): MorphikImagePreview[] {
  const root = Array.isArray(value)
    ? { content: value }
    : value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  if (!root || !Array.isArray(root.content)) return [];

  const previews: MorphikImagePreview[] = [];
  for (const block of root.content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as Record<string, unknown>).text;
    if (typeof text !== "string" || text.length > MAX_BLOCK_LENGTH) continue;
    const imageTags = [
      ...text.matchAll(/\[(IMAGE_URL|IMAGE_REF)\]([\s\S]*?)\[\/\1\]/gi),
    ];
    const titles = [...text.matchAll(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/gi)];
    const scores = [...text.matchAll(/\[SCORE\]([\s\S]*?)\[\/SCORE\]/gi)];
    const docs = [...text.matchAll(/\[DOC_URL\]([\s\S]*?)\[\/DOC_URL\]/gi)];
    for (
      let index = 0;
      index < imageTags.length && previews.length < MAX_PREVIEWS;
      index++
    ) {
      const tag = imageTags[index];
      const rawValue = tag?.[2]?.trim();
      const url =
        tag?.[1]?.toUpperCase() === "IMAGE_URL"
          ? validateMorphikImageUrl(rawValue)
          : null;
      const previewRef =
        tag?.[1]?.toUpperCase() === "IMAGE_REF" &&
        rawValue &&
        rawValue.length <= 12_000
          ? rawValue
          : null;
      if (!url && !previewRef) continue;
      const rawScore = scores[index]?.[1]?.trim();
      const parsedScore =
        rawScore && rawScore.length <= 32 ? Number(rawScore) : NaN;
      const score = Number.isFinite(parsedScore)
        ? Math.max(0, Math.min(1, parsedScore))
        : undefined;
      const docUrl = safeDocUrl(docs[index]?.[1]?.trim());
      previews.push({
        ...(url ? { url } : {}),
        ...(previewRef ? { previewRef } : {}),
        title: safeTitle(titles[index]?.[1], previews.length),
        ...(score === undefined ? {} : { score }),
        ...(docUrl ? { docUrl } : {}),
      });
    }
  }
  return previews;
}

/** Remove signed image/document URLs and opaque previews from the JSON transcript. */
export function sanitizeMorphikText(text: string): string {
  if (text.length > MAX_BLOCK_LENGTH)
    return "[Morphik result omitted: text exceeded display limit]";
  return text
    .replace(
      /\[(?:IMAGE_URL|IMAGE_REF|DOC_URL|PREVIEW)\][\s\S]*?(?:\[\/(?:IMAGE_URL|IMAGE_REF|DOC_URL|PREVIEW)\]|$)/gi,
      "[Morphik media preview]",
    )
    .replace(
      /\[(?:TITLE|SCORE)\]([\s\S]*?)\[\/(?:TITLE|SCORE)\]/gi,
      (_match, content: string) =>
        content
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, MAX_TITLE_LENGTH),
    );
}

export function inspectRasterImage(
  bytes: Uint8Array,
  contentType: string | null,
): "image/png" | "image/jpeg" | "image/webp" | null {
  const type = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const jpeg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  const webp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (type === "image/png" && png) return "image/png";
  if (type === "image/jpeg" && jpeg) return "image/jpeg";
  if (type === "image/webp" && webp) return "image/webp";
  return null;
}
