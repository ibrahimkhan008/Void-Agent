import { describe, expect, it } from "vitest";
import {
  getWorkflowApprovalTokenField,
  hashWorkflowRunApproval,
  workflowRunApprovalSchema,
} from "./workflow-run-approval";

describe("workflow run approval payload", () => {
  it("hashes JSON objects independent of key order", () => {
    const first = workflowRunApprovalSchema.parse({
      platform: "windmill",
      target: "u/team/deploy",
      payload: { region: "eu", options: { dryRun: false, count: 2 } },
    });
    const second = workflowRunApprovalSchema.parse({
      platform: "windmill",
      target: "u/team/deploy",
      payload: { options: { count: 2, dryRun: false }, region: "eu" },
    });
    expect(hashWorkflowRunApproval(first)).toBe(
      hashWorkflowRunApproval(second),
    );
    expect(hashWorkflowRunApproval(first)).not.toBe(
      hashWorkflowRunApproval({ ...first, target: "u/team/other" }),
    );
  });

  it("bounds targets and payload size and rejects non-JSON values", () => {
    expect(
      workflowRunApprovalSchema.safeParse({
        platform: "windmill",
        target: "x\nadmin",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      workflowRunApprovalSchema.safeParse({
        platform: "windmill",
        target: "x",
        payload: { text: "x".repeat(16_001) },
      }).success,
    ).toBe(false);
    expect(
      workflowRunApprovalSchema.safeParse({
        platform: "windmill",
        target: "x",
        payload: { value: Number.NaN },
      }).success,
    ).toBe(false);
  });

  it("rejects deeply nested approval payloads", () => {
    let value: unknown = "leaf";
    for (let index = 0; index < 30; index += 1) value = { nested: value };
    expect(
      workflowRunApprovalSchema.safeParse({
        platform: "n8n",
        target: "workflow_1",
        workflowName: "Example",
        graphRevision: "a".repeat(64),
        payload: { value },
      }).success,
    ).toBe(false);
  });

  it("chooses a collision-free workflow approval field", () => {
    expect(getWorkflowApprovalTokenField({})).toBe(
      "voidAgentWorkflowApprovalToken",
    );
    expect(
      getWorkflowApprovalTokenField({
        voidAgentWorkflowApprovalToken: { type: "string" },
        voidAgentWorkflowApprovalToken_: {},
      }),
    ).toBe("voidAgentWorkflowApprovalToken__");
  });
});
