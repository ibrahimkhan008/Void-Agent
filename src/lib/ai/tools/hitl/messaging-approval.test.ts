import { describe, expect, it } from "vitest";
import { hashMessagingApproval, messagingApprovalSchema } from "./messaging-approval";

describe("messaging approval contract", () => {
  it("validates provider-specific target and topic rules", () => {
    expect(messagingApprovalSchema.safeParse({ provider: "teams", destination: "19:chat@thread.v2", content: "Hello" }).success).toBe(true);
    expect(messagingApprovalSchema.safeParse({ provider: "discord", destination: "123456789", content: "Hello" }).success).toBe(true);
    expect(messagingApprovalSchema.safeParse({ provider: "discord", destination: "bad/id", content: "Hello" }).success).toBe(false);
    expect(messagingApprovalSchema.safeParse({ provider: "discord", destination: "123456789", content: "x".repeat(2001) }).success).toBe(false);
    expect(messagingApprovalSchema.safeParse({ provider: "zulip", destination: "general", content: "Hello" }).success).toBe(false);
    expect(messagingApprovalSchema.safeParse({ provider: "zulip", destination: "general", topic: "updates", content: "Hello" }).success).toBe(true);
    expect(messagingApprovalSchema.safeParse({ provider: "teams", destination: "chat-1", topic: "updates", content: "Hello" }).success).toBe(false);
  });

  it("binds the digest to the provider, destination, topic and content", () => {
    const payload = { provider: "zulip" as const, destination: "general", topic: "updates", content: "Reviewed" };
    expect(hashMessagingApproval(payload)).not.toBe(hashMessagingApproval({ ...payload, topic: "random" }));
    expect(hashMessagingApproval(payload)).not.toBe(hashMessagingApproval({ ...payload, provider: "teams", topic: undefined }));
  });
});
