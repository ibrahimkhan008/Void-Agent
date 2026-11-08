import {
  type MorphikImagePreview,
  parseMorphikImagePreviews,
  sanitizeMorphikText,
} from "./morphik-media";

const MAX_PREVIEWS = 3;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_AUDIO_PREVIEWS = 2;
const MAX_AUDIO_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_RESOURCE_LINKS = 10;
const MAX_RESOURCE_URI_LENGTH = 2_048;
const MAX_RESOURCE_LABEL_LENGTH = 160;
const MAX_RESOURCE_DESCRIPTION_LENGTH = 280;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-wav",
]);

export interface McpImagePreview {
  src: string;
  mimeType: string;
}

export interface McpAudioPreview {
  src: string;
  mimeType: string;
}

export interface McpResourceLinkPreview {
  href: string;
  host: string;
  label: string;
  description?: string;
}

function safeLabel(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return label ? label.slice(0, maxLength) : fallback;
}

function getSafeResourceHref(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_RESOURCE_URI_LENGTH ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract only bounded, inline raster images from MCP content. Never render
 * server-provided URLs: that would allow arbitrary MCP results to trigger
 * third-party tracking requests in the user's browser.
 */
export function prepareMcpToolResult(result: unknown): {
  displayResult: unknown;
  imagePreviews: McpImagePreview[];
  audioPreviews: McpAudioPreview[];
  resourceLinks: McpResourceLinkPreview[];
  morphikPreviews: MorphikImagePreview[];
  isError: boolean;
} {
  const imagePreviews: McpImagePreview[] = [];
  const audioPreviews: McpAudioPreview[] = [];
  const resourceLinks: McpResourceLinkPreview[] = [];
  const morphikPreviews = parseMorphikImagePreviews(result);
  const root = Array.isArray(result)
    ? { content: result }
    : result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;
  const content = root && Array.isArray(root.content) ? root.content : null;

  if (!content) {
    return {
      displayResult: result,
      imagePreviews,
      audioPreviews,
      resourceLinks,
      morphikPreviews,
      isError: Boolean(root?.isError),
    };
  }

  const safeContent = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const record = block as Record<string, unknown>;
    if (
      record.type === "text" &&
      typeof record.text === "string" &&
      /\[(?:IMAGE_URL|TITLE|SCORE|DOC_URL|PREVIEW)\]/i.test(record.text)
    ) {
      return { ...record, text: sanitizeMorphikText(record.text) };
    }
    if (record.type === "resource_link") {
      const href = getSafeResourceHref(record.uri);
      if (href && resourceLinks.length < MAX_RESOURCE_LINKS) {
        const label = safeLabel(
          record.title ?? record.name,
          new URL(href).hostname,
          MAX_RESOURCE_LABEL_LENGTH,
        );
        const description = safeLabel(
          record.description,
          "",
          MAX_RESOURCE_DESCRIPTION_LENGTH,
        );
        resourceLinks.push({
          href,
          host: new URL(href).host,
          label,
          ...(description ? { description } : {}),
        });
        return { ...record, uri: "[resource link preview]" };
      }
      return { ...record, uri: "[resource link omitted: unsupported URL]" };
    }
    if (record.type !== "image" && record.type !== "audio") return block;

    if (record.type === "audio") {
      const mimeType =
        typeof record.mimeType === "string"
          ? record.mimeType.toLowerCase()
          : "";
      const data = typeof record.data === "string" ? record.data : "";
      const byteLength = Math.floor((data.length * 3) / 4);
      const isBase64 =
        data.length > 0 &&
        data.length % 4 === 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(data);
      const previewAllowed =
        audioPreviews.length < MAX_AUDIO_PREVIEWS &&
        ALLOWED_AUDIO_TYPES.has(mimeType) &&
        isBase64 &&
        byteLength <= MAX_AUDIO_PREVIEW_BYTES;

      if (previewAllowed) {
        audioPreviews.push({
          src: `data:${mimeType};base64,${data}`,
          mimeType,
        });
      }

      const { url: _untrustedUrl, ...safeRecord } = record;
      return {
        ...safeRecord,
        data: previewAllowed
          ? "[inline audio preview]"
          : "[audio omitted: unsupported or over display limit]",
      };
    }

    const mimeType =
      typeof record.mimeType === "string" ? record.mimeType.toLowerCase() : "";
    const data = typeof record.data === "string" ? record.data : "";
    const byteLength = Math.floor((data.length * 3) / 4);
    const isBase64 =
      data.length > 0 &&
      data.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(data);

    const previewAllowed =
      imagePreviews.length < MAX_PREVIEWS &&
      ALLOWED_IMAGE_TYPES.has(mimeType) &&
      isBase64 &&
      byteLength <= MAX_PREVIEW_BYTES;
    if (previewAllowed) {
      imagePreviews.push({
        src: `data:${mimeType};base64,${data}`,
        mimeType,
      });
    }

    // Keep the transcript JSON useful without duplicating base64 payloads.
    const { url: _untrustedUrl, ...safeRecord } = record;
    return {
      ...safeRecord,
      data: previewAllowed
        ? "[inline image preview]"
        : "[image omitted: unsupported or over display limit]",
    };
  });

  const displayResult = Array.isArray(result)
    ? safeContent
    : { ...root, content: safeContent };

  return {
    displayResult,
    imagePreviews,
    audioPreviews,
    resourceLinks,
    morphikPreviews,
    isError: Boolean(root?.isError),
  };
}
