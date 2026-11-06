import { describe, expect, it } from "vitest";
import {
  deriveProjectBrainGraph,
  deriveProjectBrainNodeDetail,
  findPotentialProjectBrainContradictions,
  findProjectBrainExperts,
  findProjectBrainShortestPath,
  getProjectFactConflictResolution,
  traverseProjectBrainGraph,
} from "./brain-graph";

const facts = [
  { id: "1", subject: "Project", predicate: "owner", object: "Alex", reviewStatus: "accepted" },
  { id: "2", subject: "Project", predicate: "owner", object: "Sam", reviewStatus: "proposed" },
  { id: "3", subject: "Project", predicate: "owner", object: "Alex", reviewStatus: "proposed" },
  { id: "4", subject: "Project", predicate: "status", object: "Active", reviewStatus: "rejected" },
];

describe("project brain graph", () => {
  it("derives normalized nodes and fact-backed edges", () => {
    const graph = deriveProjectBrainGraph(facts);
    expect(graph.nodes.find((node) => node.id === "project")?.label).toBe("Project");
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]?.id).toBe("1");
  });

  it("uses stable typed page IDs while retaining labels for user lookups", () => {
    const typed = [
      { id: "type-a", subject: "North Star", predicate: "entity type", object: "project", reviewStatus: "accepted", subjectPageId: "page-1", subjectPageTitle: "Northstar" },
      { id: "link", subject: "North Star", predicate: "owns", object: "Riya", reviewStatus: "accepted", subjectPageId: "page-1", subjectPageTitle: "Northstar" },
      { id: "alias", subject: "Northstar", predicate: "owns", object: "Riya", reviewStatus: "accepted", subjectPageId: "page-1", subjectPageTitle: "Northstar" },
    ];
    const graph = deriveProjectBrainGraph(typed);
    expect(graph.nodes.find((node) => node.id === "page-1")).toMatchObject({ label: "Northstar", factCount: 3 });
    expect(traverseProjectBrainGraph(typed, { focus: "North Star", depth: 1 }).nodes.map((node) => node.id))
      .toContain("page-1");
    expect(findProjectBrainShortestPath(typed, { from: "Northstar", to: "Riya" }).nodes.map((node) => node.id))
      .toEqual(["page-1", "riya"]);
    const detail = deriveProjectBrainNodeDetail("page-1", typed.map((fact) => ({
      ...fact, evidence: "source", confidence: 1, sourceItemId: "source", collectionId: "collection", filename: null, sourceUrl: null,
    })));
    expect(detail?.node).toMatchObject({ id: "page-1", label: "Northstar" });
  });

  it("traverses bounded undirected neighborhoods and honors the node limit", () => {
    const chain = [
      { id: "a", subject: "Project", predicate: "owns", object: "Northstar", reviewStatus: "accepted" },
      { id: "b", subject: "Northstar", predicate: "uses", object: "PostgreSQL", reviewStatus: "proposed" },
      { id: "c", subject: "PostgreSQL", predicate: "runs on", object: "Cloud", reviewStatus: "accepted" },
    ];
    const oneHop = traverseProjectBrainGraph(chain, { focus: "project", depth: 1 });
    expect(oneHop.nodes.map((node) => node.id)).toEqual(["project", "northstar"]);
    expect(oneHop.edges.map((edge) => edge.id)).toEqual(["a"]);

    const twoHops = traverseProjectBrainGraph(chain, { focus: "project", depth: 2, limit: 2 });
    expect(twoHops.nodes).toHaveLength(2);
    expect(twoHops.nodes.map((node) => node.id)).toEqual(["project", "northstar"]);
    expect(traverseProjectBrainGraph(chain, { focus: "missing" })).toEqual({ nodes: [], edges: [] });
  });

  it("finds a bounded shortest path over accepted facts and excludes proposed/rejected claims", () => {
    const claims = [
      { id: "direct-proposed", subject: "Alpha", predicate: "links", object: "Omega", reviewStatus: "proposed" },
      { id: "one", subject: "Alpha", predicate: "uses", object: "Beta", reviewStatus: "accepted" },
      { id: "two", subject: "Beta", predicate: "owns", object: "Omega", reviewStatus: "accepted" },
      { id: "rejected", subject: "Alpha", predicate: "knows", object: "Hidden", reviewStatus: "rejected" },
    ];
    const path = findProjectBrainShortestPath(claims, { from: "alpha", to: "OMEGA" });
    expect(path.nodes.map((node) => node.id)).toEqual(["alpha", "beta", "omega"]);
    expect(path.edges.map((edge) => edge.id)).toEqual(["one", "two"]);
    expect(findProjectBrainShortestPath(claims, { from: "alpha", to: "hidden" })).toEqual({ nodes: [], edges: [] });
    expect(findProjectBrainShortestPath(claims, { from: "alpha", to: "omega", maxDepth: 1 })).toEqual({ nodes: [], edges: [] });
  });

  it("routes a topic to people using accepted typed facts and aliases only", () => {
    const source = (id: string, subject: string, predicate: string, object: string, reviewStatus = "accepted") => ({
      id, subject, predicate, object, reviewStatus, evidence: `${subject} ${predicate} ${object}`,
      confidence: 0.8, sourceItemId: "source-1", collectionId: "collection-1", filename: "plan.md", sourceUrl: null,
    });
    const routingFacts = [
      source("jane-type", "Jane Doe", "entity type", "person"),
      source("jane-alias", "Jane Doe", "also known as", "J. Doe"),
      source("topic-alias", "Search platform", "also known as", "Retrieval system"),
      source("jane-link", "Jane Doe", "leads", "Search platform"),
      source("kim-type", "Kim", "entity type", "person"),
      source("kim-link", "Kim", "lives in", "Riverside"),
      source("bob-type", "Bob", "entity type", "person", "proposed"),
      source("bob-link", "Bob", "leads", "Search platform", "accepted"),
    ];
    const experts = findProjectBrainExperts(routingFacts, "Retrieval system");
    expect(experts.map((expert) => expert.label)).toEqual(["Jane Doe"]);
    expect(experts[0]?.connections.map((fact) => fact.id)).toEqual(["jane-link"]);
    expect(findProjectBrainExperts(routingFacts, "unknown topic")).toEqual([]);
  });

  it("does not guess when an alias belongs to multiple people", () => {
    const source = (id: string, subject: string, predicate: string, object: string) => ({
      id, subject, predicate, object, reviewStatus: "accepted", evidence: `${subject} ${predicate} ${object}`,
      confidence: 0.8, sourceItemId: "source-1", collectionId: "collection-1", filename: null, sourceUrl: null,
    });
    const facts = [
      source("jane-type", "Jane Doe", "entity type", "person"),
      source("jane-alias", "Jane Doe", "also known as", "Alex"),
      source("jane-link", "Jane Doe", "leads", "Search platform"),
      source("kim-type", "Kim Smith", "entity type", "person"),
      source("kim-alias", "Kim Smith", "also known as", "Alex"),
      source("kim-link", "Kim Smith", "maintains", "Search platform"),
    ];

    expect(findProjectBrainExperts(facts, "Alex")).toEqual([]);
    expect(findProjectBrainExperts(facts, "Search platform").map((expert) => expert.label))
      .toEqual(["Jane Doe", "Kim Smith"]);
  });

  it("finds possible conflicts and excludes rejected claims", () => {
    const conflicts = findPotentialProjectBrainContradictions(facts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.first.id).toBe("1");
    expect(conflicts[0]?.second.id).toBe("2");
  });

  it("only resolves two facts that differ on one shared claim key", () => {
    expect(getProjectFactConflictResolution(facts[0]!, facts[1]!, "1")).toEqual({
      keepId: "1",
      rejectId: "2",
    });
    expect(getProjectFactConflictResolution(facts[0]!, facts[2]!, "1")).toBeNull();
  });

  it("returns node aliases, neighboring entities, and source-backed facts", () => {
    const detail = deriveProjectBrainNodeDetail("northstar", [
      {
        id: "alias", subject: "Northstar", predicate: "alias", object: "North Star",
        reviewStatus: "accepted", evidence: "Northstar, also called North Star.", confidence: 0.9,
        sourceItemId: "source-1", collectionId: "collection-1", filename: "plan.pdf", sourceUrl: null,
      },
      {
        id: "owner", subject: "Northstar", predicate: "owner", object: "Riya",
        reviewStatus: "proposed", evidence: "Riya leads Northstar.", confidence: 0.8,
        sourceItemId: "source-1", collectionId: "collection-1", filename: "plan.pdf", sourceUrl: null,
      },
      {
        id: "rejected", subject: "Northstar", predicate: "status", object: "Cancelled",
        reviewStatus: "rejected", evidence: "A rejected claim.", confidence: 0.7,
        sourceItemId: "source-1", collectionId: "collection-1", filename: "plan.pdf", sourceUrl: null,
      },
    ]);

    expect(detail?.node).toEqual({ id: "northstar", label: "Northstar", factCount: 2 });
    expect(detail?.aliases).toEqual(["North Star"]);
    expect(detail?.neighbors).toEqual([{ id: "riya", label: "Riya", factCount: 1 }]);
    expect(detail?.facts.map((fact) => fact.id)).toEqual(["alias", "owner"]);
    expect(deriveProjectBrainNodeDetail("unknown", [])).toBeNull();
  });
});
