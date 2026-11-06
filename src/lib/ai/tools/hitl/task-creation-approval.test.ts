import { describe, expect, it } from "vitest";
import { hashTaskCreationApproval, taskCreationApprovalSchema } from "./task-creation-approval";

describe("task creation approval schema", () => {
  it("accepts numeric provider targets and rejects malformed IDs", () => {
    const payload = { provider: "asana", targetId: "123", name: "Review", details: "Notes" };
    expect(taskCreationApprovalSchema.safeParse(payload).success).toBe(true);
    expect(taskCreationApprovalSchema.safeParse({ ...payload, targetId: "../tasks" }).success).toBe(false);
  });

  it("binds provider, target and task fields into the digest", () => {
    const payload = { provider: "asana" as const, targetId: "123", name: "Review", details: "Notes" };
    expect(hashTaskCreationApproval(payload)).not.toBe(hashTaskCreationApproval({ ...payload, name: "Changed" }));
    expect(hashTaskCreationApproval(payload)).not.toBe(hashTaskCreationApproval({ ...payload, provider: "clickup" }));
  });

  it("accepts and hashes exact Productboard feature fields", () => {
    const payload = { provider: "productboard" as const, targetId: "prod_7a8b-9c", name: "Roadmap item", details: "Reviewed description" };
    expect(taskCreationApprovalSchema.safeParse(payload).success).toBe(true);
    expect(taskCreationApprovalSchema.safeParse({ ...payload, targetId: "bad/id" }).success).toBe(false);
    expect(hashTaskCreationApproval(payload)).not.toBe(hashTaskCreationApproval({ ...payload, details: "Changed after review" }));
  });
});
