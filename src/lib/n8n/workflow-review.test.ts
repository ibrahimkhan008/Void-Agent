import { describe, expect, it } from "vitest";
import {
  getN8nRunAcknowledgement,
  getN8nWorkflowEffectManifest,
  getN8nWorkflowEffectReview,
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
        method: "POST",
        url: "https://api.example.test/private/path",
        authentication: "predefinedCredentialType",
        jsonBody: '{"action":"archive"}',
      },
      credentials: {
        httpBasicAuth: { id: "credential-secret", name: "secret" },
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

  it("previews literal HTTP effects in full and only names protected credentials", () => {
    const review = getN8nWorkflowEffectReview(workflow);
    const effects = getN8nWorkflowEffectManifest(workflow);
    expect(review.reviewable).toBe(true);
    expect(review.issues).toEqual([]);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toContain(
      "HTTP POST https://api.example.test/private/path",
    );
    expect(effects[0]).toContain("archive");
    expect(effects[0]).toContain("httpBasicAuth: [configured]");
    expect(JSON.stringify(review)).not.toContain("credential-secret");
    expect(JSON.stringify(review)).not.toContain('"name":"secret"');
  });

  it("rejects dynamic and unsupported effects without echoing secret values", () => {
    const dynamic = getN8nWorkflowEffectReview({
      ...workflow,
      nodes: [
        {
          id: "http",
          name: "Dynamic request",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            method: "POST",
            url: "https://api.example.test/{{ $json.destination }}",
            body: { apiKey: "do-not-return-this" },
          },
        },
      ],
    });
    expect(dynamic.reviewable).toBe(false);
    expect(dynamic.effects).toEqual([]);
    expect(JSON.stringify(dynamic)).not.toContain("do-not-return-this");

    const unsupported = getN8nWorkflowEffectReview({
      ...workflow,
      nodes: [
        {
          id: "mail",
          name: "Send mail",
          type: "n8n-nodes-base.gmail",
          parameters: { operation: "send" },
        },
      ],
    });
    expect(unsupported.reviewable).toBe(false);
    expect(unsupported.issues[0]).toContain("unsupported action type");
  });

  it("does not claim truncated action arguments are exact", () => {
    const review = getN8nWorkflowEffectReview({
      ...workflow,
      nodes: [
        {
          id: "http",
          name: "Large request",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            method: "POST",
            url: "https://api.example.test/path",
            body: "x".repeat(1_001),
          },
        },
      ],
    });
    expect(review.reviewable).toBe(false);
    expect(review.effects).toEqual([]);
    expect(review.issues[0]).toContain("exceed the safe review size");
  });

  it("caps the reviewed node count and summary output", () => {
    const review = getN8nWorkflowEffectReview({
      ...workflow,
      nodes: Array.from({ length: 210 }, (_, index) => ({
        id: String(index),
        name: `Step ${index}`,
        type: "community.action",
        parameters: {},
      })),
    });
    expect(review.reviewable).toBe(false);
    expect(review.issues.some((issue) => issue.includes("more than 200"))).toBe(
      true,
    );
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
