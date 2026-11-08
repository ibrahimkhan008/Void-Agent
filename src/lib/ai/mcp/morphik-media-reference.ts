import "server-only";

import { decrypt, encrypt } from "lib/security/encryption";
import { validateMorphikImageUrl } from "./morphik-media";

const TOKEN_TTL_MS = 5 * 60_000;
const MAX_REFERENCES_PER_RESULT = 8;
const MAX_REFERENCE_LENGTH = 12_000;

type MorphikReference = {
  version: 1;
  userId: string;
  url: string;
  expiresAt: number;
};

function createReference(
  url: string,
  userId: string,
  now: number,
  seal: (value: string) => string,
): string | null {
  try {
    const reference = seal(
      JSON.stringify({
        version: 1,
        userId,
        url,
        expiresAt: now + TOKEN_TTL_MS,
      } satisfies MorphikReference),
    );
    return reference.length <= MAX_REFERENCE_LENGTH ? reference : null;
  } catch {
    // Missing encryption configuration disables previews without exposing the
    // signed upstream URL to the model or persisted chat transcript.
    return null;
  }
}

export function resolveMorphikImageReference(
  reference: unknown,
  userId: string,
  options: {
    now?: number;
    unseal?: (value: string) => string;
  } = {},
): string | null {
  if (
    typeof reference !== "string" ||
    reference.length === 0 ||
    reference.length > MAX_REFERENCE_LENGTH
  )
    return null;
  try {
    const decoded = JSON.parse(
      (options.unseal ?? decrypt)(reference),
    ) as Partial<MorphikReference> | null;
    if (
      !decoded ||
      decoded.version !== 1 ||
      decoded.userId !== userId ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= (options.now ?? Date.now())
    )
      return null;
    return validateMorphikImageUrl(decoded.url);
  } catch {
    return null;
  }
}

/**
 * Replace Morphik bearer URLs before MCP results reach the model, transcript,
 * or persistence. The browser receives only a short-lived encrypted reference.
 */
export function protectMorphikMcpResult(
  result: unknown,
  userId: string,
  options: {
    now?: number;
    seal?: (value: string) => string;
  } = {},
): unknown {
  if (!result || typeof result !== "object") return result;
  const root = result as Record<string, unknown>;
  if (!Array.isArray(root.content)) return result;

  let referenceCount = 0;
  let changed = false;
  const now = options.now ?? Date.now();
  const seal = options.seal ?? encrypt;
  const content = root.content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const record = block as Record<string, unknown>;
    if (record.type !== "text" || typeof record.text !== "string") return block;

    const protectedText = record.text
      .replace(
        /\[IMAGE_URL\]([\s\S]*?)(?:\[\/IMAGE_URL\]|$)/gi,
        (_match, rawUrl: string) => {
          const url = validateMorphikImageUrl(rawUrl.trim());
          if (!url || referenceCount >= MAX_REFERENCES_PER_RESULT)
            return "[IMAGE_REF][/IMAGE_REF]";
          const reference = createReference(url, userId, now, seal);
          if (!reference) return "[IMAGE_REF][/IMAGE_REF]";
          referenceCount += 1;
          return `[IMAGE_REF]${reference}[/IMAGE_REF]`;
        },
      )
      .replace(
        /\[(?:DOC_URL|PREVIEW)\][\s\S]*?(?:\[\/(?:DOC_URL|PREVIEW)\]|$)/gi,
        "[Morphik source detail omitted]",
      )
      .replace(
        /https:\/\/(?:morphik-storage\.s3\.amazonaws\.com|s3\.amazonaws\.com)\/[^\s<>{}"']+/gi,
        "[Morphik URL omitted]",
      )
      .replace(
        /\[TITLE\]([\s\S]*?)\[\/TITLE\]/gi,
        (_match, rawTitle: string) => {
          const title = rawTitle
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180);
          return /https?:\/\//i.test(title)
            ? "[TITLE]Image result[/TITLE]"
            : `[TITLE]${title}[/TITLE]`;
        },
      );
    if (protectedText === record.text) return block;
    changed = true;
    return { ...record, text: protectedText };
  });

  // Preserve the original MCP payload for tools that do not emit Morphik media.
  // Besides avoiding needless copies, this keeps the result-boundary contract
  // intact for callers that rely on pass-through identity.
  return changed ? { ...root, content } : result;
}
