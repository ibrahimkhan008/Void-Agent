import { z } from "zod";

export const VOICE_THREAD_MAX_TURNS_PER_FLUSH = 20;
export const VOICE_THREAD_MAX_PART_CHARS = 24_000;
export const VOICE_THREAD_FLUSH_DEBOUNCE_MS = 1_500;

export const voiceSessionThreadRequestSchema = z.object({
  threadId: z.string().uuid(),
  contextThreadId: z.string().uuid().optional(),
  voiceSessionId: z.string().trim().min(1).max(120),
  agentId: z.string().uuid().optional(),
  turns: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.unknown()).max(60),
  })).min(1).max(VOICE_THREAD_MAX_TURNS_PER_FLUSH),
});

export type VoiceSessionTurn = { id: string; role: "user" | "assistant"; parts: unknown[] };
export type VoiceSessionThreadRequest = z.infer<typeof voiceSessionThreadRequestSchema>;
export type VoiceSessionMessage = { id: string; role: string; parts: unknown[]; completed: boolean };

export function capVoiceTurnParts(parts: unknown[]) {
  let serialized: string;
  try {
    serialized = JSON.stringify(parts);
  } catch {
    return [{ type: "text", text: "[unreadable voice turn]" }];
  }
  if (serialized.length <= VOICE_THREAD_MAX_PART_CHARS) return parts;

  let remaining = VOICE_THREAD_MAX_PART_CHARS;
  const capped: unknown[] = [];
  for (const part of parts) {
    const typed = part as { type?: unknown; text?: unknown };
    if (typed?.type === "text" && typeof typed.text === "string" && remaining > 0) {
      const text = typed.text.slice(0, remaining);
      remaining -= text.length;
      capped.push({ type: "text", text });
      continue;
    }
    if (typed?.type === "text") continue;
    capped.push({
      type: typeof typed?.type === "string" ? typed.type.slice(0, 64) : "data",
      output: { truncated: true, note: "Result was too large to keep in chat history." },
    });
  }
  let encoded = JSON.stringify(capped);
  while (encoded.length > VOICE_THREAD_MAX_PART_CHARS) {
    const textIndex = capped.findLastIndex((part) => {
      const typed = part as { type?: unknown; text?: unknown };
      return typed?.type === "text" && typeof typed.text === "string" && typed.text.length > 0;
    });
    if (textIndex < 0) return [{ type: "text", text: "[voice turn omitted: content exceeded the storage limit]" }];
    const textPart = capped[textIndex] as { type: "text"; text: string };
    capped[textIndex] = { ...textPart, text: textPart.text.slice(0, Math.max(0, Math.floor(textPart.text.length * 0.75))) };
    encoded = JSON.stringify(capped);
  }
  return capped;
}

export function selectVoiceTurnsToPersist(
  messages: VoiceSessionMessage[],
  sent: ReadonlyMap<string, string>,
) {
  const turns: VoiceSessionTurn[] = [];
  const signatures = new Map<string, string>();
  const userHasSpoken = messages.some((message) =>
    message.completed && message.role === "user" && message.parts.length > 0,
  );
  if (!userHasSpoken) return { turns, signatures };

  for (const message of messages) {
    if (!message.completed || (message.role !== "user" && message.role !== "assistant") || !message.parts.length) continue;
    const parts = capVoiceTurnParts(message.parts);
    let signature: string;
    try {
      signature = JSON.stringify(parts);
    } catch {
      continue;
    }
    if (sent.get(message.id) === signature) continue;
    turns.push({ id: message.id, role: message.role, parts });
    signatures.set(message.id, signature);
    if (turns.length >= VOICE_THREAD_MAX_TURNS_PER_FLUSH) break;
  }
  return { turns, signatures };
}

export function deriveVoiceThreadTitle(turns: VoiceSessionTurn[]) {
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const text = turn.parts.map((part) => {
      const typed = part as { type?: unknown; text?: unknown };
      return typed?.type === "text" && typeof typed.text === "string" ? typed.text : "";
    }).join(" ").trim();
    if (text) return text.slice(0, 80);
  }
  return "Voice conversation";
}

export async function readVoiceJsonBody(request: Request, maxBytes = 600_000): Promise<
  | { ok: true; value: unknown }
  | { ok: false; reason: "too-large" | "invalid-json" }
> {
  if (!request.body) return { ok: false, reason: "invalid-json" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid-json" };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}
