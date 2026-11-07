import { describe, expect, it } from "vitest";
import type { N8nWorkflowDefinition } from "./client";
import { toN8nWorkflowReadOnlySummary } from "./workflow-summary";

describe("n8n read-only workflow summary", () => {
  it("exposes bounded labels only and never sends node configuration to the UI", () => {
    const summary = toN8nWorkflowReadOnlySummary({
      id: "workflow_1",
      name: "Example",
      active: true,
      description: null,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      nodes: [
        {
          name: "Send request",
          type: "n8n-nodes-base.httpRequest",
          parameters: { url: "https://example.test?token=secret-value" },
          credentials: { apiKey: { id: "credential-secret" } },
        },
      ],
      connections: { "Send request": { main: [] } },
      settings: { saveDataErrorExecution: "all" },
    } as unknown as N8nWorkflowDefinition);

    expect(summary.nodes).toEqual([
      { name: "Send request", type: "n8n-nodes-base.httpRequest" },
    ]);
    expect(JSON.stringify(summary)).not.toContain("secret-value");
    expect(JSON.stringify(summary)).not.toContain("credential-secret");
    expect(summary).not.toHaveProperty("connections");
    expect(summary).not.toHaveProperty("settings");
  });

  it("redacts credential-like labels and caps the displayed node list", () => {
    const summary = toN8nWorkflowReadOnlySummary({
      id: "workflow_1",
      name: "API token=secret-value",
      active: false,
      description: "private_key=secret-value",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      nodes: Array.from({ length: 205 }, (_, index) => ({
        name: `Step ${index}`,
        type: "n8n-nodes-base.noOp",
      })),
      connections: {},
    });

    expect(summary.name).toBe("API token=[redacted]");
    expect(summary.description).toBe("private_key=[redacted]");
    expect(summary.nodes).toHaveLength(200);
  });
});
