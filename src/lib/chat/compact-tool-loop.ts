import { type ModelMessage, pruneMessages } from "ai";

/** Number of most recent loop messages left untouched during a long tool turn. */
export const COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES = 6;

function hasResultForCallOutsideLoop(messages: ModelMessage[]): boolean {
  const calls = new Set<string>();
  const results: string[] = [];

  for (const message of messages) {
    if (
      (message.role !== "assistant" && message.role !== "tool") ||
      typeof message.content === "string"
    ) {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-call") calls.add(part.toolCallId);
      else if (part.type === "tool-result") results.push(part.toolCallId);
    }
  }

  return results.some((id) => !calls.has(id));
}

/**
 * Prune old tool-loop output while preserving call/result pairs and the recent
 * tail. The initial conversation is deliberately not accepted as an argument.
 * Returns undefined when pruning would be unsafe or has no effect.
 */
export function compactToolLoopMessages(
  responseMessages: ModelMessage[],
): ModelMessage[] | undefined {
  if (hasResultForCallOutsideLoop(responseMessages)) return undefined;

  const paired = pruneMessages({
    messages: responseMessages,
    toolCalls: `before-last-${COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES}-messages`,
    emptyMessages: "remove",
  });
  const keepFrom = Math.max(
    0,
    paired.length - COMPACT_TOOL_LOOP_KEEP_RECENT_MESSAGES,
  );
  const compacted = [
    ...pruneMessages({
      messages: paired.slice(0, keepFrom),
      reasoning: "all",
      emptyMessages: "remove",
    }),
    ...paired.slice(keepFrom),
  ];

  if (
    compacted.length === responseMessages.length &&
    compacted.every((message, index) => message === responseMessages[index])
  ) {
    return undefined;
  }
  return compacted;
}

/** Compact only stream-generated loop messages, never the submitted history. */
export function compactCurrentToolLoop(
  initialMessages: ModelMessage[],
  stepMessages: ModelMessage[],
): ModelMessage[] | undefined {
  if (stepMessages.length <= initialMessages.length) return undefined;
  const compactedLoop = compactToolLoopMessages(
    stepMessages.slice(initialMessages.length),
  );
  return compactedLoop ? [...initialMessages, ...compactedLoop] : undefined;
}
