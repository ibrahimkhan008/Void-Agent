import { describe, expect, it } from "vitest";
import { getWorkflowEffectManifest, getWorkflowGraphRevision } from "./workflow-review";

describe("saved workflow review", () => {
  it("summarizes external effects without exposing paths, headers, or request bodies", () => {
    const effects = getWorkflowEffectManifest([
      { name: "Notify", kind: "http", nodeConfig: { method: "POST", url: "https://api.example.test/private/path?token=secret", headers: [{ key: "Authorization", value: "secret" }], body: "private payload" } },
      { name: "MCP", kind: "tool", nodeConfig: { tool: { type: "mcp-tool", serverName: "Calendar", id: "create_event" } } },
    ]);
    expect(effects).toEqual(["Notify: POST request to api.example.test", "MCP: MCP server Calendar, tool create_event"]);
    expect(JSON.stringify(effects)).not.toMatch(/private|secret|Authorization/);
  });

  it("creates stable but graph-sensitive revisions", () => {
    const nodes = [{ id: "a", kind: "input" }];
    expect(getWorkflowGraphRevision(nodes, [])).toBe(getWorkflowGraphRevision([{ kind: "input", id: "a" }], []));
    expect(getWorkflowGraphRevision(nodes, [])).not.toBe(getWorkflowGraphRevision(nodes, [{ source: "a", target: "b" }]));
    expect(getWorkflowGraphRevision([{ id: "b" }, { id: "a" }], [])).toBe(getWorkflowGraphRevision([{ id: "a" }, { id: "b" }], []));
  });
});
