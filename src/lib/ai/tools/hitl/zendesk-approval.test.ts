import { describe, expect, it } from "vitest";
import { hashZendeskCommentApproval, zendeskCommentApprovalSchema } from "./zendesk-approval";

describe("Zendesk comment approval contract", () => {
  it("accepts bounded numeric ticket comments and rejects unsafe ids or extra fields", () => {
    expect(zendeskCommentApprovalSchema.safeParse({ ticketId: "123", comment: "Reviewed" }).success).toBe(true);
    expect(zendeskCommentApprovalSchema.safeParse({ ticketId: "../123", comment: "Reviewed" }).success).toBe(false);
    expect(zendeskCommentApprovalSchema.safeParse({ ticketId: "123", comment: "Reviewed", extra: true }).success).toBe(false);
  });

  it("binds the digest to the exact approved comment", () => {
    const first = { ticketId: "123", comment: "Reviewed" };
    expect(hashZendeskCommentApproval(first)).not.toBe(hashZendeskCommentApproval({ ...first, comment: "Changed" }));
  });
});
