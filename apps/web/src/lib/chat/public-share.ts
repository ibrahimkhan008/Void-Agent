import { createHash, randomBytes } from "node:crypto";
import type { ChatExport } from "app-types/chat-export";

/** A 256-bit bearer token is returned once; only its SHA-256 digest is stored. */
export function createPublicShareToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPublicShareToken(token);
  if (!tokenHash) throw new Error("Generated invalid share token");
  return { token, tokenHash };
}

export function hashPublicShareToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const PRIVATE_LINK_MARKER = "[private link removed]";
const SENSITIVE_URL = /https?:\/\/[^\s<>"')\]]+/gi;
const PRIVATE_URL_HINT =
  /\/api\/storage\/|[?&](?:token|access_token|auth|password|signature|sig|secret|key|api[_-]?key|credential|bearer)=|x-amz-(?:algorithm|credential|date|expires|signature)/i;

function redactPrivateLinks(text: string) {
  return text.replace(SENSITIVE_URL, (url) =>
    PRIVATE_URL_HINT.test(url) ? PRIVATE_LINK_MARKER : url,
  );
}

/**
 * Public transcripts render prose only. Tool calls/results, attachment and
 * source URL parts, and metadata (including usage, model and run IDs) remain
 * private. Preserve only user/assistant text and replace internal message IDs.
 */
export function sanitizePublicChatMessages(
  messages: ChatExport["messages"],
): ChatExport["messages"] {
  return messages.flatMap((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const parts = message.parts.flatMap((part) => {
      if (
        typeof part !== "object" ||
        part === null ||
        part.type !== "text" ||
        typeof part.text !== "string"
      ) {
        return [];
      }
      return [{ type: "text" as const, text: redactPrivateLinks(part.text) }];
    });
    if (parts.length === 0) return [];
    return [{ id: `shared-${index + 1}`, role: message.role, parts }];
  });
}
