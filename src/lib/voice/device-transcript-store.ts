import type { UIMessage } from "ai";
import { chatRepository } from "lib/db/repository";
import { voiceDeviceUuid } from "./device-transcript";

export async function persistVoiceDeviceTranscript(
  device: { id: string; userId: string },
  input: { sessionId: string; eventId: string; text: string; language?: string },
) {
  const threadId = voiceDeviceUuid("voice-device-thread", device.id, input.sessionId);
  const messageId = voiceDeviceUuid("voice-device-event", device.id, input.sessionId, input.eventId);
  const existing = await chatRepository.selectThread(threadId);
  if (existing && existing.userId !== device.userId) return { forbidden: true as const };
  if (!existing) {
    await chatRepository.upsertThread({ id: threadId, userId: device.userId, title: `Voice: ${input.text.slice(0, 64)}` });
  }
  await chatRepository.upsertMessage({
    id: messageId,
    threadId,
    role: "user",
    parts: [{ type: "text", text: input.text }] as UIMessage["parts"],
    metadata: { source: "voice_device", deviceId: device.id, sessionId: input.sessionId, eventId: input.eventId, ...(input.language ? { language: input.language } : {}) },
  });
  return { forbidden: false as const, threadId, messageId };
}
