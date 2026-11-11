export const COMMUNITY_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_UPLOAD_BODY_MAX_BYTES =
  COMMUNITY_MEDIA_MAX_BYTES + 64 * 1024;

/** Read a multipart body with a hard cap before parsing the File object. */
export async function readCommunityUploadBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > COMMUNITY_UPLOAD_BODY_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export const COMMUNITY_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function isValidCommunityMedia(
  contentType: string,
  bytes: Uint8Array,
  size: number,
) {
  if (
    !COMMUNITY_MEDIA_TYPES.has(contentType) ||
    size <= 0 ||
    size > COMMUNITY_MEDIA_MAX_BYTES
  ) {
    return false;
  }

  switch (contentType) {
    case "image/jpeg":
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case "image/png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        ascii(bytes, 1, 4) === "PNG" &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif":
      return (
        bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))
      );
    case "image/webp":
      return (
        bytes.length >= 12 &&
        ascii(bytes, 0, 4) === "RIFF" &&
        ascii(bytes, 8, 12) === "WEBP"
      );
    case "video/mp4":
    case "video/quicktime":
      return bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp";
    case "video/webm":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    default:
      return false;
  }
}

export function sanitizeCommunityFilename(name: string) {
  const cleaned = name
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(-120);
  return cleaned || "community-media";
}
