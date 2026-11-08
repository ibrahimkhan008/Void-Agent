const TOOL_NAME_NAMESPACES = ["functions", "tools", "tool", "namespace"];
const CALL_INDEX_SUFFIX = /:\d+$/;

function stripKnownNamespace(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const namespace of TOOL_NAME_NAMESPACES) {
    for (const separator of [".", "_", ":"]) {
      const prefix = `${namespace}${separator}`;
      if (lowerName.startsWith(prefix) && name.length > prefix.length) {
        return name.slice(prefix.length);
      }
    }
  }
  return undefined;
}

/**
 * Resolve provider wire-format aliases only to names in the already-bound
 * tool set. Case-folding is accepted only when it identifies one tool.
 */
export function repairBoundToolName(
  boundToolNames: Iterable<string>,
  rawName: string,
): string | null {
  const bound = [...boundToolNames];
  const byLowerCase = new Map<string, string[]>();
  for (const name of bound) {
    const lower = name.toLowerCase();
    byLowerCase.set(lower, [...(byLowerCase.get(lower) ?? []), name]);
  }

  const exactNames = new Set(bound);
  const caseInsensitiveUnique = (candidate: string): string | null => {
    const matches = byLowerCase.get(candidate.toLowerCase());
    return matches?.length === 1 ? matches[0]! : null;
  };

  const initial = rawName.trim();
  const candidates = [initial];
  const withoutIndex = initial.replace(CALL_INDEX_SUFFIX, "");
  if (withoutIndex !== initial) candidates.push(withoutIndex);
  for (const candidate of [...candidates]) {
    const stripped = stripKnownNamespace(candidate);
    if (stripped) candidates.push(stripped);
  }

  for (const candidate of candidates) {
    if (exactNames.has(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    const match = caseInsensitiveUnique(candidate);
    if (match) return match;
  }
  return null;
}
