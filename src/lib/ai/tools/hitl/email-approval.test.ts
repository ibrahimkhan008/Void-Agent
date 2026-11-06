import { describe, expect, it } from "vitest";
import { emailApprovalPayloadSchema, hashEmailApprovalPayload, hashEmailApprovalToken } from "./email-approval";

describe("email effect approvals", () => {
  const send = { action: "send" as const, to: "person@example.com", subject: "Update", body: "Approved text" };

  it("validates bounded send and reply approvals", () => {
    expect(emailApprovalPayloadSchema.safeParse(send).success).toBe(true);
    expect(emailApprovalPayloadSchema.safeParse({ ...send, action: "reply", messageId: "gmail-message-1" }).success).toBe(true);
    expect(emailApprovalPayloadSchema.safeParse({ ...send, to: "bad-address" }).success).toBe(false);
    expect(emailApprovalPayloadSchema.safeParse({ ...send, body: "x".repeat(12_001) }).success).toBe(false);
    expect(emailApprovalPayloadSchema.safeParse({ ...send, action: "reply" }).success).toBe(false);
  });

  it("binds authorization to the exact action and reviewed payload", () => {
    expect(hashEmailApprovalPayload(send)).toBe(hashEmailApprovalPayload({ ...send }));
    expect(hashEmailApprovalPayload(send)).not.toBe(hashEmailApprovalPayload({ ...send, body: "Changed" }));
    expect(hashEmailApprovalPayload(send)).not.toBe(hashEmailApprovalPayload({ ...send, action: "reply", messageId: "gmail-message-1" }));
  });

  it("stores only a one-way token digest", () => {
    expect(hashEmailApprovalToken("random-bearer-token")).not.toContain("random-bearer-token");
    expect(hashEmailApprovalToken("random-bearer-token")).toHaveLength(64);
  });
});
