import type { LanguageModelUsage } from "ai";
import type { ChatModel } from "app-types/chat";

/**
 * Best-effort context sizes for models exposed by the primary model catalog.
 * Unknown and administrator-defined models intentionally have no estimate.
 * Values are keyed by provider/model so similarly named providers cannot be
 * mistaken for each other.
 */
const contextWindows: Record<string, number> = {
  "openai/gpt 5.5": 400_000,
  "openai/gpt 5.4": 400_000,
  "openai/gpt 5.3": 400_000,
  "openai/gpt 5.2": 400_000,
  "openai/gpt-5.5": 400_000,
  "openai/gpt-5.4": 400_000,
  "openai/gpt-5.3": 400_000,
  "openai/gpt-5.2": 400_000,
  "anthropic/claude opus 4.6": 200_000,
  "anthropic/claude opus 4.5": 200_000,
  "anthropic/claude sonnet 4.6": 200_000,
  "anthropic/claude sonnet 4.5": 200_000,
  "anthropic/claude haiku 4.5": 200_000,
  "google/gemini 3.1 pro": 1_000_000,
  "google/gemini 3 flash": 1_000_000,
  "google/gemini 2.5 pro": 1_000_000,
  "google/gemini 2.5 flash": 1_000_000,
  "groq/llama 4 scout": 131_072,
  "groq/llama 4 maverick": 131_072,
  "groq/gpt-oss-120b": 131_072,
  "zai/glm-5": 200_000,
  "zai/glm-4.7": 200_000,
  "deepseek/deepseek v3.2": 131_072,
  "deepseek/deepseek v3.1": 131_072,
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function getModelContextWindow(
  model?: ChatModel | null,
): number | undefined {
  if (!model?.provider || !model.model) return undefined;
  return contextWindows[
    `${normalize(model.provider)}/${normalize(model.model)}`
  ];
}

export function selectLatestCompletedContextUsage(
  messages: readonly { role: string; metadata?: unknown }[],
):
  | {
      usage: LanguageModelUsage;
      model: ChatModel;
    }
  | undefined {
  // A newer assistant response without complete usage invalidates the older
  // estimate; otherwise the composer would show stale context after errors or
  // interrupted generations.
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const metadata = latestAssistant?.metadata as
    | {
        runStatus?: string;
        usage?: LanguageModelUsage;
        chatModel?: ChatModel;
      }
    | undefined;
  if (
    metadata?.runStatus !== "completed" ||
    !metadata.usage ||
    !metadata.chatModel ||
    getContextUsageTokens(metadata.usage) === undefined
  ) {
    return undefined;
  }
  return { usage: metadata.usage, model: metadata.chatModel };
}

export function getContextUsageTokens(
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  } | null,
): number | undefined {
  if (!usage) return undefined;
  const input = Number.isFinite(usage.inputTokens) ? usage.inputTokens! : 0;
  const output = Number.isFinite(usage.outputTokens) ? usage.outputTokens! : 0;
  const total = input + output || usage.totalTokens || 0;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

export function getContextUsagePercent(
  usedTokens: number,
  maxTokens: number,
): number {
  if (
    !Number.isFinite(usedTokens) ||
    !Number.isFinite(maxTokens) ||
    maxTokens <= 0
  ) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((usedTokens / maxTokens) * 100)));
}

export function formatContextTokenCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) {
    const thousands = count / 1_000;
    return `${thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10}K`;
  }
  const millions = count / 1_000_000;
  return `${millions >= 100 ? Math.round(millions) : Math.round(millions * 10) / 10}M`;
}
