import type { UIMessage } from "ai";
import type { ChatMetadata } from "app-types/chat";

/** Keep a regenerated answer on the model and tool mode used for that turn. */
export function getRetryTurnSettings(messages: UIMessage[]) {
  const previousAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const metadata = previousAssistant?.metadata as ChatMetadata | undefined;
  return {
    ...(metadata?.chatModel ? { chatModel: metadata.chatModel } : {}),
    ...(metadata?.toolChoice ? { toolChoice: metadata.toolChoice } : {}),
  };
}
