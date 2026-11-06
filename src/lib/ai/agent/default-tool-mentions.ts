import type { ChatMention } from "app-types/chat";
import { DefaultToolName } from "lib/ai/tools";

export const MAX_AGENT_DEFAULT_TOOLS = 20;

const defaultToolNames = new Set<string>(Object.values(DefaultToolName));

/** Keep model proposals inside the built-in tool catalog before persistence. */
export function normalizeDefaultToolNames(names: unknown): DefaultToolName[] {
  if (!Array.isArray(names)) return [];

  const unique: DefaultToolName[] = [];
  for (const name of names) {
    if (
      typeof name !== "string" ||
      !defaultToolNames.has(name) ||
      unique.includes(name as DefaultToolName)
    ) {
      continue;
    }
    unique.push(name as DefaultToolName);
    if (unique.length === MAX_AGENT_DEFAULT_TOOLS) break;
  }
  return unique;
}

/** Persist built-in capabilities through the existing agent mention contract. */
export function defaultToolMentionsFromNames(names: unknown): ChatMention[] {
  return normalizeDefaultToolNames(names).map((name) => ({
    type: "defaultTool",
    name,
    label: name,
  }));
}
