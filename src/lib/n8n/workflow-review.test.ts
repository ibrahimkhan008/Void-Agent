import { describe, expect, it } from "vitest";
import {
  getN8nRunAcknowledgement,
  getN8nWorkflowEffectManifest,
  getN8nWorkflowRevision,
} from "./workflow-review";

const workflow = {
  id: "workflow_123",
  name: "Example",
  active: false,
  description: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  nodes: [
    {
      id: "1",
      name: "Send request",
      type: "n8n-nodes-base.httpRequest",
      parameters: {
        url: "https://api.example.test/private/path?token=secret",
        authentication: "predefinedCredentialType",
      },
    },
    { id: "2", name: "Filter", type: "n8n-nodes-base.if", parameters: {} },
  ],
  connections: { "Send request": { main: [] } },
  settings: {},
};

describe("n8n workflow review", () => {
  it("hashes the executable definition independent of object key order", () => {
    const reordered = {
      ...workflow,
      settings: {},
      connections: { "Send request": { main: [] } },
    };
    expect(getN8nWorkflowRevision(workflow)).toBe(
      getN8nWorkflowRevision(reordered),
    );
    expect(getN8nWorkflowRevision(workflow)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("summarizes steps without exposing URL paths, query strings, or credentials", () => {
    const effects = getN8nWorkflowEffectManifest(workflow);
    expect(effects).toEqual([
      "Send request: action or integration (n8n-nodes-base.httpRequest) to api.example.test",
      "Filter: logic (n8n-nodes-base.if)",
    ]);
    expect(JSON.stringify(effects)).not.toContain("private");
    expect(JSON.stringify(effects)).not.toContain("secret");
  });

  it("caps the reviewed node count and summary output", () => {
    const effects = getN8nWorkflowEffectManifest({
      ...workflow,
      nodes: Array.from({ length: 210 }, (_, index) => ({
        id: String(index),
        name: `Step ${index}`,
        type: "community.action",
        parameters: {},
      })),
    });
    expect(effects).toHaveLength(31);
    expect(effects.at(-1)).toBe("180 additional steps omitted");
  });

  it("returns only a bounded execution acknowledgement", () => {
    expect(
      getN8nRunAcknowledgement({
        data: { executionId: "run-1", resultData: { token: "secret" } },
        credentials: "secret",
      }),
    ).toEqual({ accepted: true, executionId: "run-1" });
    expect(
      getN8nRunAcknowledgement({ data: { resultData: { token: "secret" } } }),
    ).toEqual({ accepted: true });
  });
});
