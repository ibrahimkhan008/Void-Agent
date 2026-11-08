type VoiceTranscriptMessage = {
  id: string;
  threadId?: string;
  role: string;
  parts: Array<{ type: string; text?: string }>;
  metadata?: { source?: string };
};

/** Reject an async voice result if navigation or a newer request superseded it. */
export function isCurrentVoiceRequest(input: {
  requestedIdentity: string;
  currentIdentity: string;
  requestedGeneration: number;
  currentGeneration: number;
}): boolean {
  return (
    input.requestedIdentity === input.currentIdentity &&
    input.requestedGeneration === input.currentGeneration
  );
}

/** Accept only an owned saved voice message; return bounded plain text for a user-requested chat handoff. */
export function getVoiceTranscriptForHandoff(input: {
  userId: string;
  requestedUserId: string;
  threadId: string;
  messageId: string;
  message: VoiceTranscriptMessage | null;
}) {
  const message = input.message;
  if (
    input.userId !== input.requestedUserId ||
    !message ||
    message.id !== input.messageId ||
    message.threadId !== input.threadId ||
    message.role !== "user" ||
    (message.metadata?.source !== "voice_device" &&
      message.metadata?.source !== "voice_realtime")
  ) {
    return null;
  }
  const text = message.parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n")
    .trim();
  return text.length > 0 ? text.slice(0, 24_000) : null;
}
