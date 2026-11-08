import { describe, expect, it } from "vitest";
import { matchAgentByReference } from "./match-agent";

const agents = [
  { id: "agent-sales", name: "Sales Agent" },
  { id: "agent-support", name: "Customer Support" },
];

describe("matchAgentByReference", () => {
  it("prefers exact IDs and case-insensitive exact names", () => {
    expect(matchAgentByReference(agents, "agent-sales")).toBe(agents[0]);
    expect(matchAgentByReference(agents, "customer support")).toBe(agents[1]);
  });

  it("resolves a unique partial speech reference", () => {
    expect(matchAgentByReference(agents, "sales")).toBe(agents[0]);
    expect(matchAgentByReference(agents, "Support")).toBe(agents[1]);
  });

  it("does not guess when partial references are ambiguous", () => {
    const ambiguous = [
      ...agents,
      { id: "agent-sales-ops", name: "Sales Operations" },
    ];
    expect(matchAgentByReference(ambiguous, "sales")).toBeNull();
  });

  it("returns null for empty or unavailable references", () => {
    expect(matchAgentByReference(agents, "  ")).toBeNull();
    expect(matchAgentByReference(agents, "private payroll")).toBeNull();
  });
});
