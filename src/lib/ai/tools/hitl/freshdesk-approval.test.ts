import { describe, expect, it } from "vitest";
import { freshdeskEffectApprovalSchema, hashFreshdeskEffectApproval } from "./freshdesk-approval";

describe("Freshdesk approval contract", () => {
  it("accepts bounded ticket create/reply operations and rejects unsafe values", () => {
    expect(freshdeskEffectApprovalSchema.safeParse({ action: "add_reply", ticketId: "123", body: "Reviewed" }).success).toBe(true);
    expect(freshdeskEffectApprovalSchema.safeParse({ action: "add_reply", ticketId: "../123", body: "Reviewed" }).success).toBe(false);
    expect(freshdeskEffectApprovalSchema.safeParse({ action: "create_ticket", subject: "Help", description: "Details", requesterName: "Sam", requesterEmail: "sam@example.com", status: 2, priority: 1 }).success).toBe(true);
    expect(freshdeskEffectApprovalSchema.safeParse({ action: "create_ticket", subject: "Help", description: "Details", requesterName: "Sam", requesterEmail: "bad", status: 2, priority: 1 }).success).toBe(false);
  });

  it("binds approval to the complete effect payload", () => {
    const payload = { action: "add_reply" as const, ticketId: "123", body: "Reviewed" };
    expect(hashFreshdeskEffectApproval(payload)).not.toBe(hashFreshdeskEffectApproval({ ...payload, body: "Altered" }));
  });
});
