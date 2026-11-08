import { type UIMessage, isToolUIPart } from "ai";

/** Number of newest user turns kept byte-for-byte in the model request. */
export const OUTBOUND_HISTORY_KEEP_RECENT_TURNS = 2;

/** Maximum size of a single older preview/result part, measured in characters. */
export const OUTBOUND_HISTORY_MAX_PART_CHARS = 2_000;

const TRUNCATION_MARKER = "…[truncated —";

// These files are already represented by extracted preview text in the same
// message. They need not be sent to a provider a second time on later turns.
const INGESTED_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function truncate(value: string, maxChars: number): string {
  // Preserve fixed output on repeated application; otherwise the marker itself
  // would be cut and the serialized request would drift on each pass.
  if (value.includes(TRUNCATION_MARKER) || value.length <= maxChars)
    return value;
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n${TRUNCATION_MARKER} ${omitted} characters omitted from an earlier turn]`;
}

function firstIndexOfRecentTurns(messages: UIMessage[], turns: number): number {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    if (++seen === turns) return i;
  }
  return 0;
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Return a model-request-only copy with bulky parts of older turns trimmed.
 * The input transcript and the newest two user turns are never mutated.
 */
export function slimOutboundChatHistory(
  messages: UIMessage[],
  options: { keepRecentTurns?: number; maxPartChars?: number } = {},
): UIMessage[] {
  const keepRecentTurns =
    options.keepRecentTurns ?? OUTBOUND_HISTORY_KEEP_RECENT_TURNS;
  const maxPartChars = options.maxPartChars ?? OUTBOUND_HISTORY_MAX_PART_CHARS;
  if (
    !Number.isInteger(keepRecentTurns) ||
    keepRecentTurns < 1 ||
    !Number.isInteger(maxPartChars) ||
    maxPartChars < 1 ||
    messages.length <= 1
  ) {
    return messages;
  }

  const keepFrom = firstIndexOfRecentTurns(messages, keepRecentTurns);
  if (keepFrom === 0) return messages;

  let changed = false;
  const result = messages.map((message, messageIndex) => {
    if (messageIndex >= keepFrom || !message.parts?.length) return message;

    const parts = message.parts;
    const hasIngestionPreview = parts.some(
      (part) =>
        part.type === "text" &&
        "ingestionPreview" in part &&
        part.ingestionPreview === true,
    );

    let messageChanged = false;
    const nextParts = parts.flatMap((part) => {
      if (
        hasIngestionPreview &&
        part.type === "file" &&
        INGESTED_FILE_MIME_TYPES.has(
          (part.mediaType ?? "").split(";")[0]!.trim().toLowerCase(),
        )
      ) {
        messageChanged = true;
        return [];
      }

      if (
        part.type === "text" &&
        "ingestionPreview" in part &&
        part.ingestionPreview === true
      ) {
        const text = truncate(part.text, maxPartChars);
        if (text !== part.text) {
          messageChanged = true;
          return [{ ...part, text }];
        }
      }

      if (isToolUIPart(part) && part.state === "output-available") {
        const serialized =
          typeof part.output === "string"
            ? part.output
            : safeStringify(part.output);
        if (serialized !== undefined && serialized.length > maxPartChars) {
          messageChanged = true;
          return [{ ...part, output: truncate(serialized, maxPartChars) }];
        }
      }

      return [part];
    });

    if (!messageChanged) return message;
    changed = true;
    return { ...message, parts: nextParts };
  });

  return changed ? result : messages;
}
