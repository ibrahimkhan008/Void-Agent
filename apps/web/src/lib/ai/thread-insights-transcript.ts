import { createHash } from "node:crypto";
import type { ChatMessage } from "app-types/chat";

/** A deterministic digest used to reject stale model output before persisting. */
export function fingerprintThreadTranscript(messages: ChatMessage[]) {
  const canonical = messages.map((message) => ({
    id: message.id,
    role: message.role,
    createdAt: message.createdAt.toISOString(),
    parts: message.parts,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
