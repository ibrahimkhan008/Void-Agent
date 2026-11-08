import { describe, expect, it } from "vitest";
import {
  matchesProjectBrainGraphSearch,
  searchProjectBrainGraphNodes,
} from "./brain-graph-search";

const nodes = [
  { id: "n1", label: "Northstar" },
  { id: "n2", label: "PostgreSQL" },
  { id: "n3", label: "Northwind" },
];

describe("project brain graph search", () => {
  it("matches labels case-insensitively and caps the result count", () => {
    expect(searchProjectBrainGraphNodes(nodes, "NORTH")).toEqual([
      nodes[0],
      nodes[2],
    ]);
    expect(
      searchProjectBrainGraphNodes(
        Array.from({ length: 12 }, (_, index) => ({
          id: `n${index}`,
          label: `North Avenue ${index}`,
        })),
        "north",
        1_000,
      ),
    ).toHaveLength(8);
  });

  it("returns no result for blank queries and reports visual matches", () => {
    expect(searchProjectBrainGraphNodes(nodes, "   ")).toEqual([]);
    expect(matchesProjectBrainGraphSearch(nodes[1]!, "sql")).toBe(true);
    expect(matchesProjectBrainGraphSearch(nodes[0]!, "sql")).toBe(false);
    expect(matchesProjectBrainGraphSearch(nodes[0]!, "  ")).toBe(true);
  });
});
