import { describe, expect, it } from "vitest";
import {
  getWorkflowEffectReview,
  getWorkflowGraphRevision,
} from "./workflow-review";

describe("saved workflow review", () => {
  it("summarizes an exact bounded HTTP request with a structured body", () => {
    const review = getWorkflowEffectReview([
      {
        name: "Notify",
        kind: "http",
        nodeConfig: {
          method: "POST",
          url: "https://api.example.test/v1/private",
          headers: [{ key: "Content-Type", value: "application/json" }],
          query: [{ key: "mode", value: "safe" }],
          body: '{"action":"notify"}',
        },
      },
    ]);
    expect(review.reviewable).toBe(true);
    expect(review.effects[0]).toContain(
      "POST https://api.example.test/v1/private",
    );
    expect(review.effects[0]).toContain('body={"action":"notify"}');
  });

  it("redacts literal credentials and refuses to approve hidden secret-bearing HTTP effects", () => {
    const review = getWorkflowEffectReview([
      {
        name: "Send private request",
        kind: "http",
        nodeConfig: {
          method: "POST",
          url: "https://api.example.test/v1?access_token=url-secret",
          headers: [{ key: "Authorization", value: "Bearer header-secret" }],
          query: [{ key: "client_secret", value: "query-secret" }],
          body: '{"action":"send","nested":{"password":"body-secret"}}',
        },
      },
    ]);
    const serialized = JSON.stringify(review);
    expect(review.reviewable).toBe(false);
    expect(review.issues.join(" ")).toContain(
      "move them to a protected connection",
    );
    for (const secret of [
      "url-secret",
      "header-secret",
      "query-secret",
      "body-secret",
    ])
      expect(serialized).not.toContain(secret);
    expect(review.effects).toEqual([]);
  });

  it("does not expose or approve credential-like path segments", () => {
    const secretPath = "whsec_0123456789abcdefghijklmnopqrstuvwxyz";
    const review = getWorkflowEffectReview([
      {
        name: "Call webhook",
        kind: "http",
        nodeConfig: {
          method: "POST",
          url: `https://api.example.test/webhook/${secretPath}`,
          headers: [],
          query: [],
          body: JSON.stringify({ event: "update" }),
        },
      },
    ]);

    expect(review.reviewable).toBe(false);
    expect(review.effects).toEqual([]);
    expect(JSON.stringify(review)).not.toContain(secretPath);
  });

  it("fails closed without echoing unstructured request body content", () => {
    const review = getWorkflowEffectReview([
      {
        name: "Send text",
        kind: "http",
        nodeConfig: {
          method: "POST",
          url: "https://api.example.test",
          headers: [],
          query: [],
          body: "opaque text that may contain a secret",
        },
      },
    ]);
    expect(review.reviewable).toBe(false);
    expect(JSON.stringify(review)).not.toContain(
      "opaque text that may contain a secret",
    );
    expect(review.issues[0]).toContain("cannot be previewed exactly");
  });

  it("requires per-effect review when HTTP arguments resolve at runtime", () => {
    const review = getWorkflowEffectReview([
      {
        name: "Dynamic request",
        kind: "http",
        nodeConfig: {
          method: "POST",
          url: { nodeId: "input", path: ["url"] },
          headers: [],
          query: [],
          body: { nodeId: "input", path: ["body"] },
        },
      },
    ]);
    expect(review.reviewable).toBe(false);
    expect(review.issues).toContain(
      "Dynamic request: HTTP request arguments are dynamic or invalid and cannot be previewed exactly",
    );
  });

  it("fails closed for tool effects whose arguments are generated during execution", () => {
    const review = getWorkflowEffectReview([
      {
        name: "Create event",
        kind: "tool",
        nodeConfig: {
          tool: {
            type: "mcp-tool",
            serverId: "calendar-1",
            serverName: "Calendar",
            id: "create_event",
            parameterSchema: {
              type: "object",
              properties: { title: { type: "string" } },
            },
          },
        },
      },
    ]);
    expect(review.reviewable).toBe(false);
    expect(review.issues[0]).toContain("generates parameters at runtime");
  });

  it("enumerates an MCP tool action and its known empty argument object", () => {
    const review = getWorkflowEffectReview([
      {
        name: "List calendars",
        kind: "tool",
        nodeConfig: {
          tool: {
            type: "mcp-tool",
            serverId: "calendar-1",
            serverName: "Calendar",
            id: "list_calendars",
          },
        },
      },
    ]);
    expect(review).toEqual({
      effects: [
        "List calendars: call MCP server Calendar (calendar-1), tool list_calendars with arguments {}",
      ],
      issues: [],
      reviewable: true,
    });
  });

  it("enumerates built-in Void Agent tool calls", () => {
    expect(
      getWorkflowEffectReview([
        {
          name: "Search",
          kind: "tool",
          nodeConfig: { tool: { type: "app-tool", id: "web_search" } },
        },
      ]),
    ).toEqual({
      effects: ["Search: call Void Agent tool web_search with arguments {}"],
      issues: [],
      reviewable: true,
    });
  });

  it("identifies provider dispatches as requiring review, while input/output-only workflows are non-mutating", () => {
    const llmReview = getWorkflowEffectReview([
      { name: "Answer", kind: "llm", nodeConfig: { model: "provider/model" } },
    ]);
    expect(llmReview.effects).toEqual([
      "Answer: send workflow context to AI model provider/model",
    ]);
    expect(llmReview.reviewable).toBe(false);
    expect(llmReview.issues[0]).toContain(
      "LLM prompt may contain runtime workflow data",
    );
    expect(
      getWorkflowEffectReview([
        { name: "Input", kind: "input" },
        { name: "Output", kind: "output" },
        { name: "Format", kind: "template" },
      ]),
    ).toEqual({ effects: [], issues: [], reviewable: true });
  });

  it("does not silently accept an unsupported future node as a no-effect step", () => {
    const review = getWorkflowEffectReview([
      { name: "Script", kind: "code", nodeConfig: {} },
    ]);
    expect(review.reviewable).toBe(false);
    expect(review.issues[0]).toContain("unsupported workflow node type code");
  });

  it("creates stable but graph-sensitive revisions", () => {
    const nodes = [{ id: "a", kind: "input" }];
    expect(getWorkflowGraphRevision(nodes, [])).toBe(
      getWorkflowGraphRevision([{ kind: "input", id: "a" }], []),
    );
    expect(getWorkflowGraphRevision(nodes, [])).not.toBe(
      getWorkflowGraphRevision(nodes, [{ source: "a", target: "b" }]),
    );
    expect(getWorkflowGraphRevision([{ id: "b" }, { id: "a" }], [])).toBe(
      getWorkflowGraphRevision([{ id: "a" }, { id: "b" }], []),
    );
  });
});
