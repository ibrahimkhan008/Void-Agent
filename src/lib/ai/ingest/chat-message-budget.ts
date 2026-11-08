export const MAX_CHAT_ATTACHMENT_CONTEXT_CHARS = 40_000;
export const MAX_CHAT_INGESTED_ATTACHMENTS = 10;
export const MAX_CHAT_ATTACHMENT_PREVIEW_FILES = 8;

const OMISSION_NOTICE =
  "[Some attachment content was omitted because the combined message context limit was reached.]";

export type IngestionPreviewPart = {
  type: string;
  text?: string;
  ingestionPreview?: boolean;
  [key: string]: unknown;
};

export type AggregateIngestionResult<TPart extends IngestionPreviewPart> = {
  parts: TPart[];
  omitted: boolean;
  textChars: number;
};

/**
 * Process attachments one at a time and enforce one shared context budget.
 * A preview part is kept whole so a format's untrusted-content framing is not
 * cut mid-boundary. Once any part cannot fit, later attachments are not read.
 */
export async function buildAggregateIngestionPreviews<
  TAttachment,
  TPart extends IngestionPreviewPart,
>(input: {
  attachments: readonly TAttachment[];
  processAttachment: (attachment: TAttachment) => Promise<readonly TPart[]>;
  maxTextChars?: number;
  maxPreviewFiles?: number;
}): Promise<AggregateIngestionResult<TPart>> {
  const maxTextChars = input.maxTextChars ?? MAX_CHAT_ATTACHMENT_CONTEXT_CHARS;
  const maxPreviewFiles =
    input.maxPreviewFiles ?? MAX_CHAT_ATTACHMENT_PREVIEW_FILES;
  if (
    !Number.isInteger(maxTextChars) ||
    maxTextChars < OMISSION_NOTICE.length
  ) {
    throw new Error("Chat attachment context limit is invalid");
  }
  if (!Number.isInteger(maxPreviewFiles) || maxPreviewFiles < 0) {
    throw new Error("Chat attachment preview file limit is invalid");
  }

  // Reserve room for the bounded notice. If everything fits, the reserved
  // characters are simply unused.
  const contentTextLimit = maxTextChars - OMISSION_NOTICE.length;
  const parts: TPart[] = [];
  let textChars = 0;
  let previewFiles = 0;
  let omitted = false;

  const attachments = input.attachments.slice(0, MAX_CHAT_INGESTED_ATTACHMENTS);
  for (const attachment of attachments) {
    const candidateParts = await input.processAttachment(attachment);
    for (const part of candidateParts) {
      if (part.ingestionPreview !== true) continue;

      if (part.type === "file") {
        if (previewFiles >= maxPreviewFiles) {
          omitted = true;
          break;
        }
        previewFiles += 1;
        parts.push(part);
        continue;
      }

      const text = typeof part.text === "string" ? part.text : "";
      if (textChars + text.length > contentTextLimit) {
        omitted = true;
        break;
      }
      textChars += text.length;
      parts.push(part);
    }
    if (omitted) break;
  }

  if (input.attachments.length > attachments.length) omitted = true;

  if (omitted) {
    parts.push({
      type: "text",
      text: OMISSION_NOTICE,
      ingestionPreview: true,
    } as TPart);
    textChars += OMISSION_NOTICE.length;
  }

  return { parts, omitted, textChars };
}

/** Keep stored user parts separate from model-only file context. */
export function buildMessagePartsWithIngestion<TPart extends { type: string }>(
  originalParts: readonly TPart[],
  ingestionParts: readonly TPart[],
) {
  const persistedParts = [...originalParts];
  const modelParts = [...originalParts];
  if (ingestionParts.length === 0) return { persistedParts, modelParts };

  let insertionIndex = -1;
  for (let index = modelParts.length - 1; index >= 0; index -= 1) {
    if (modelParts[index]?.type === "text") {
      insertionIndex = index;
      break;
    }
  }
  if (insertionIndex >= 0) {
    modelParts.splice(insertionIndex, 0, ...ingestionParts);
  } else {
    modelParts.push(...ingestionParts);
  }
  return { persistedParts, modelParts };
}
