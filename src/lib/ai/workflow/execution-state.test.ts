import { describe, expect, it } from "vitest";
import {
  WorkflowExecutionEffectSchema,
  WorkflowExecutionInputSchema,
  WorkflowExecutionProgressSchema,
} from "./execution-state";

describe("workflow execution persistence bounds", () => {
  it("accepts bounded JSON workflow input and progress", () => {
    const nodeId = "a2b79fe0-05c3-41f0-9a76-808075a7aaf1";
    expect(
      WorkflowExecutionInputSchema.safeParse({ query: "hello", count: 2 })
        .success,
    ).toBe(true);
    expect(
      WorkflowExecutionProgressSchema.safeParse({
        completedNodes: {
          [nodeId]: { input: { query: "hello" }, output: "ok" },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects non-JSON and oversized workflow state", () => {
    expect(
      WorkflowExecutionInputSchema.safeParse({ value: Number.NaN }).success,
    ).toBe(false);
    expect(
      WorkflowExecutionInputSchema.safeParse({ value: "x".repeat(65_000) })
        .success,
    ).toBe(false);
    expect(
      WorkflowExecutionProgressSchema.safeParse({
        completedNodes: {},
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires UUID checkpoint keys and rejects excessive checkpoint state", () => {
    expect(
      WorkflowExecutionProgressSchema.safeParse({
        completedNodes: { "not-a-uuid": { input: null, output: null } },
      }).success,
    ).toBe(false);
    expect(
      WorkflowExecutionProgressSchema.safeParse({
        completedNodes: Object.fromEntries(
          Array.from({ length: 501 }, (_, index) => [
            `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
            { input: null, output: null },
          ]),
        ),
      }).success,
    ).toBe(false);
  });

  it("binds a pending side effect to its opaque digest", () => {
    expect(
      WorkflowExecutionEffectSchema.safeParse({
        nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
        kind: "http",
        target: "https://example.test/action",
        payload: { body: { approved: true } },
        hash: "a".repeat(64),
        started: false,
      }).success,
    ).toBe(true);
    expect(
      WorkflowExecutionEffectSchema.safeParse({
        nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
        kind: "http",
        target: "https://example.test/action",
        payload: {},
        hash: "not-a-digest",
      }).success,
    ).toBe(false);
  });
});
