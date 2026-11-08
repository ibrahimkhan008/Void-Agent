export type VoiceAgentChoice = { id: string; name: string };

/** Resolve a spoken agent reference without guessing when names overlap. */
export function matchAgentByReference<T extends VoiceAgentChoice>(
  agents: readonly T[],
  reference: string,
): T | null {
  const trimmed = reference.trim();
  const needle = trimmed.toLowerCase();
  if (!needle) return null;

  const byId = agents.find((agent) => agent.id === trimmed);
  if (byId) return byId;

  const byName = agents.find((agent) => agent.name.toLowerCase() === needle);
  if (byName) return byName;

  const partial = agents.filter((agent) => {
    const name = agent.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return partial.length === 1 ? partial[0] : null;
}
