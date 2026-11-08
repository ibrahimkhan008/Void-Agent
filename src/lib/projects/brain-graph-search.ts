export type ProjectBrainGraphSearchNode = { id: string; label: string };

const MAX_GRAPH_SEARCH_RESULTS = 8;

/** Search only the graph nodes already returned by the project-scoped API. */
export function searchProjectBrainGraphNodes<
  T extends ProjectBrainGraphSearchNode,
>(nodes: readonly T[], query: string, limit = MAX_GRAPH_SEARCH_RESULTS): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const boundedLimit = Math.max(
    1,
    Math.min(Math.floor(limit), MAX_GRAPH_SEARCH_RESULTS),
  );
  return nodes
    .filter((node) => node.label.toLocaleLowerCase().includes(needle))
    .slice(0, boundedLimit);
}

export function matchesProjectBrainGraphSearch(
  node: ProjectBrainGraphSearchNode,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || node.label.toLocaleLowerCase().includes(needle);
}
