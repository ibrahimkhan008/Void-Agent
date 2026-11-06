export type BrainFactForGraph = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  reviewStatus: string;
  subjectPageId?: string | null;
  objectPageId?: string | null;
  subjectPageTitle?: string | null;
  objectPageTitle?: string | null;
};

export type BrainNodeFact = BrainFactForGraph & {
  evidence: string;
  confidence: number;
  sourceItemId: string;
  collectionId: string;
  filename: string | null;
  sourceUrl: string | null;
};

export type ProjectBrainExpert = {
  id: string;
  label: string;
  score: number;
  connections: Array<Pick<BrainNodeFact, "id" | "subject" | "predicate" | "object" | "evidence" | "confidence" | "sourceItemId" | "collectionId" | "filename" | "sourceUrl">>;
};

export const normalizeProjectBrainNodeId = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const normalize = normalizeProjectBrainNodeId;

function resolveGraphNodeId(facts: BrainFactForGraph[], graph: ReturnType<typeof deriveProjectBrainGraph>, value: string) {
  if (graph.nodes.some((node) => node.id === value)) return value;
  const needle = normalize(value);
  const labelMatches = graph.nodes.filter((node) => normalize(node.label) === needle);
  const ids = new Set(labelMatches.map((node) => node.id));
  for (const fact of facts) {
    if (!EXPERT_METADATA_PREDICATES.has(normalize(fact.predicate))) continue;
    if (normalize(fact.subject) === needle && fact.subjectPageId) ids.add(fact.subjectPageId);
    if (normalize(fact.object) === needle && fact.objectPageId) ids.add(fact.objectPageId);
    if (normalize(fact.predicate) === "entity type") continue;
    if (normalize(fact.subject) === needle && fact.objectPageId) ids.add(fact.objectPageId);
    if (normalize(fact.object) === needle && fact.subjectPageId) ids.add(fact.subjectPageId);
  }
  return ids.size === 1 ? [...ids][0]! : needle;
}

const EXPERT_METADATA_PREDICATES = new Set([
  "entity type", "summary", "alias", "also known as",
]);

/** Rank typed people connected to a query through accepted, source-backed claims. */
export function findProjectBrainExperts(
  facts: BrainNodeFact[],
  query: string,
  limit = 5,
): ProjectBrainExpert[] {
  const normalizedQuery = normalize(query);
  const terms = [...new Set(normalizedQuery.match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 8);
  if (!normalizedQuery || !terms.length) return [];

  const accepted = facts.filter((fact) => fact.reviewStatus === "accepted");
  const personIds = new Set(
    accepted
      .filter((fact) => normalize(fact.predicate) === "entity type" && normalize(fact.object) === "person")
      .map((fact) => normalize(fact.subject))
      .filter(Boolean),
  );
  if (!personIds.size) return [];

  const canonicalsByAlias = new Map<string, Set<string>>();
  for (const fact of accepted) {
    if (!["alias", "also known as"].includes(normalize(fact.predicate))) continue;
    const canonical = normalize(fact.subject);
    const alias = normalize(fact.object);
    if (!canonical || !alias || canonical === alias) continue;
    const canonicals = canonicalsByAlias.get(alias) ?? new Set<string>();
    canonicals.add(canonical);
    canonicalsByAlias.set(alias, canonicals);
  }
  const uniqueCanonicalForAlias = (alias: string) => {
    const canonicals = canonicalsByAlias.get(alias);
    return canonicals?.size === 1 ? [...canonicals][0] : undefined;
  };
  const normalizeTerm = (term: string) => term.length > 4 && term.endsWith("s") ? term.slice(0, -1) : term;
  const queryTerms = terms.map(normalizeTerm);
  const matchesQuery = (value: string) => {
    const normalized = normalize(value);
    if (normalized.includes(normalizedQuery)) return true;
    const valueTerms = new Set((normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map(normalizeTerm));
    return queryTerms.every((term) => valueTerms.has(term));
  };
  const targetIds = new Set<string>();
  for (const fact of accepted) {
    for (const label of [fact.subject, fact.object]) {
      if (matchesQuery(label)) {
        const normalized = normalize(label);
        targetIds.add(uniqueCanonicalForAlias(normalized) ?? normalized);
      }
    }
  }
  for (const [alias, canonicals] of canonicalsByAlias) {
    if (canonicals.size === 1 && matchesQuery(alias)) {
      targetIds.add([...canonicals][0]!);
    }
  }
  if (!targetIds.size) return [];

  const canonicalPerson = (value: string) => {
    let current = normalize(value);
    const visited = new Set<string>();
    while (uniqueCanonicalForAlias(current) && !visited.has(current)) {
      visited.add(current);
      current = uniqueCanonicalForAlias(current)!;
    }
    return current;
  };
  const connectionsByPerson = new Map<string, ProjectBrainExpert["connections"]>();
  for (const fact of accepted) {
    if (EXPERT_METADATA_PREDICATES.has(normalize(fact.predicate))) continue;
    const subject = canonicalPerson(fact.subject);
    const object = canonicalPerson(fact.object);
    let person: string | null = null;
    if (personIds.has(subject) && targetIds.has(object)) person = subject;
    else if (personIds.has(object) && targetIds.has(subject)) person = object;
    if (!person) continue;
    const connections = connectionsByPerson.get(person) ?? [];
    if (!connections.some((connection) => connection.id === fact.id)) connections.push(fact);
    connectionsByPerson.set(person, connections);
  }

  const labelById = new Map<string, string>();
  for (const fact of accepted) {
    const subject = normalize(fact.subject);
    if (personIds.has(subject) && !labelById.has(subject)) labelById.set(subject, fact.subject.trim());
  }
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 10));
  return [...connectionsByPerson.entries()]
    .map(([id, connections]) => ({
      id,
      label: labelById.get(id) ?? id,
      score: Number(connections.reduce((sum, fact) => sum + Math.max(0, Math.min(fact.confidence, 1)), 0).toFixed(2)),
      connections: connections.slice(0, 5),
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, boundedLimit);
}

export function deriveProjectBrainGraph(facts: BrainFactForGraph[]) {
  const nodes = new Map<string, { id: string; label: string; factCount: number }>();
  const edges = facts.filter((fact) => fact.reviewStatus !== "rejected").flatMap((fact) => {
    const source = fact.subjectPageId ?? normalize(fact.subject);
    const target = fact.objectPageId ?? normalize(fact.object);
    if (!source || !target) return [];
    for (const [id, label] of [
      [source, fact.subjectPageTitle ?? fact.subject],
      [target, fact.objectPageTitle ?? fact.object],
    ]) {
      const existing = nodes.get(id);
      nodes.set(id, {
        id,
        label: existing?.label ?? label.trim(),
        factCount: (existing?.factCount ?? 0) + 1,
      });
    }
    if (source === target) return [];
    return [{
      id: fact.id,
      source,
      target,
      label: fact.predicate,
      reviewStatus: fact.reviewStatus,
    }];
  });
  return { nodes: [...nodes.values()], edges };
}

/** Bounded, undirected neighborhood traversal over the fact-backed graph. */
export function traverseProjectBrainGraph(
  facts: BrainFactForGraph[],
  input: { focus: string; depth?: number; limit?: number },
) {
  const graph = deriveProjectBrainGraph(facts);
  const focus = resolveGraphNodeId(facts, graph, input.focus);
  const depthLimit = Math.max(0, Math.min(input.depth ?? 2, 3));
  const nodeLimit = Math.max(1, Math.min(input.limit ?? 200, 400));
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!graphNodeIds.has(focus)) return { nodes: [], edges: [] };

  const depthById = new Map([[focus, 0]]);
  const queue = [focus];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const currentDepth = depthById.get(current)!;
    if (currentDepth >= depthLimit) continue;
    for (const edge of graph.edges) {
      const neighbor = edge.source === current
        ? edge.target
        : edge.target === current
          ? edge.source
          : null;
      if (!neighbor || depthById.has(neighbor) || depthById.size >= nodeLimit) continue;
      depthById.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }

  const ids = new Set(depthById.keys());
  return {
    nodes: graph.nodes
      .filter((node) => ids.has(node.id))
      .map((node) => ({ ...node, depth: depthById.get(node.id) ?? 0 }))
      .sort((a, b) => a.depth - b.depth || b.factCount - a.factCount),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

/** Find a bounded shortest path through accepted claims only. */
export function findProjectBrainShortestPath(
  facts: BrainFactForGraph[],
  input: { from: string; to: string; maxDepth?: number; nodeLimit?: number },
) {
  const graph = deriveProjectBrainGraph(facts.filter((fact) => fact.reviewStatus === "accepted"));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const resolve = (value: string) => {
    return resolveGraphNodeId(facts, graph, value);
  };
  const from = resolve(input.from);
  const to = resolve(input.to);
  const nodeLimit = Math.max(1, Math.min(input.nodeLimit ?? 200, 400));
  const maxDepth = Math.max(1, Math.min(input.maxDepth ?? 6, 8));
  if (!nodesById.has(from) || !nodesById.has(to)) return { nodes: [], edges: [] };
  if (from === to) return { nodes: [nodesById.get(from)!], edges: [] };

  const edgesByNode = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    edgesByNode.set(edge.source, [...(edgesByNode.get(edge.source) ?? []), edge]);
    edgesByNode.set(edge.target, [...(edgesByNode.get(edge.target) ?? []), edge]);
  }
  const previous = new Map<string, { nodeId: string; edge: (typeof graph.edges)[number] }>();
  const depthById = new Map([[from, 0]]);
  const queue = [from];
  for (let index = 0; index < queue.length && !depthById.has(to); index += 1) {
    const current = queue[index]!;
    const depth = depthById.get(current)!;
    if (depth >= maxDepth) continue;
    for (const edge of edgesByNode.get(current) ?? []) {
      const neighbor = edge.source === current ? edge.target : edge.source;
      if (depthById.has(neighbor) || depthById.size >= nodeLimit) continue;
      depthById.set(neighbor, depth + 1);
      previous.set(neighbor, { nodeId: current, edge });
      queue.push(neighbor);
      if (neighbor === to) break;
    }
  }
  if (!depthById.has(to)) return { nodes: [], edges: [] };

  const pathNodeIds = [to];
  const pathEdges: typeof graph.edges = [];
  let current = to;
  while (current !== from) {
    const step = previous.get(current);
    if (!step) return { nodes: [], edges: [] };
    pathEdges.push(step.edge);
    current = step.nodeId;
    pathNodeIds.push(current);
  }
  pathNodeIds.reverse();
  pathEdges.reverse();
  return {
    nodes: pathNodeIds.map((id) => nodesById.get(id)!),
    edges: pathEdges,
  };
}

/** Resolve a normalized graph node ID into its visible claims and neighbors. */
export function deriveProjectBrainNodeDetail(
  nodeId: string,
  facts: BrainNodeFact[],
) {
  const key = nodeId;
  const visibleFacts = facts.filter((fact) => {
    if (fact.reviewStatus === "rejected") return false;
    return fact.subjectPageId === key || fact.objectPageId === key ||
      (normalize(fact.subject) === normalize(key) && !fact.subjectPageId) ||
      (normalize(fact.object) === normalize(key) && !fact.objectPageId);
  });
  if (!visibleFacts.length) return null;

  const subjectFact = visibleFacts.find((fact) => fact.subjectPageId === key || normalize(fact.subject) === normalize(key));
  const label = subjectFact?.subjectPageTitle ?? subjectFact?.subject
    ?? visibleFacts.find((fact) => fact.objectPageId === key || normalize(fact.object) === normalize(key))?.objectPageTitle
    ?? visibleFacts.find((fact) => fact.objectPageId === key || normalize(fact.object) === normalize(key))?.object
    ?? nodeId;
  const aliases = [...new Set(
    visibleFacts
      .filter((fact) => ["alias", "also known as"].includes(normalize(fact.predicate)))
      .map((fact) => normalize(fact.subject) === key ? fact.object.trim() : fact.subject.trim())
      .filter(Boolean),
  )].filter((alias) => normalize(alias) !== key);
  const neighbors = new Map<string, { id: string; label: string; factCount: number }>();
  for (const fact of visibleFacts) {
    const subjectIsNode = fact.subjectPageId === key || normalize(fact.subject) === normalize(key);
    if (["alias", "also known as"].includes(normalize(fact.predicate))) continue;
    const neighborLabel = subjectIsNode ? fact.object : fact.subject;
    const neighborId = subjectIsNode ? fact.objectPageId ?? normalize(neighborLabel) : fact.subjectPageId ?? normalize(neighborLabel);
    if (!neighborId || neighborId === key) continue;
    const existing = neighbors.get(neighborId);
    neighbors.set(neighborId, {
      id: neighborId,
      label: existing?.label ?? ((subjectIsNode ? fact.objectPageTitle : fact.subjectPageTitle)?.trim() || neighborLabel.trim()),
      factCount: (existing?.factCount ?? 0) + 1,
    });
  }

  return {
    node: { id: key, label, factCount: visibleFacts.length },
    aliases,
    facts: visibleFacts.slice(0, 100),
    neighbors: [...neighbors.values()].slice(0, 50),
  };
}

export function findPotentialProjectBrainContradictions(
  facts: BrainFactForGraph[],
) {
  const groups = new Map<string, BrainFactForGraph[]>();
  for (const fact of facts) {
    if (fact.reviewStatus === "rejected") continue;
    const key = `${normalize(fact.subject)}\u0000${normalize(fact.predicate)}`;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  const conflicts: Array<{ first: BrainFactForGraph; second: BrainFactForGraph }> = [];
  for (const group of groups.values()) {
    const variants = new Map<string, BrainFactForGraph>();
    for (const fact of group) {
      const value = normalize(fact.object);
      if (value && !variants.has(value)) variants.set(value, fact);
    }
    const uniqueValues = [...variants.values()];
    for (let i = 0; i < uniqueValues.length; i += 1) {
      for (let j = i + 1; j < uniqueValues.length; j += 1) {
        conflicts.push({ first: uniqueValues[i]!, second: uniqueValues[j]! });
        if (conflicts.length >= 100) return conflicts;
      }
    }
  }
  return conflicts;
}

export function getProjectFactConflictResolution(
  first: BrainFactForGraph,
  second: BrainFactForGraph,
  keepFactId: string,
) {
  if (first.id === second.id) return null;
  if (![first.id, second.id].includes(keepFactId)) return null;
  const sameClaimKey =
    normalize(first.subject) === normalize(second.subject) &&
    normalize(first.predicate) === normalize(second.predicate);
  const distinctValues = normalize(first.object) !== normalize(second.object);
  if (!sameClaimKey || !distinctValues) return null;
  return {
    keepId: keepFactId,
    rejectId: keepFactId === first.id ? second.id : first.id,
  };
}
