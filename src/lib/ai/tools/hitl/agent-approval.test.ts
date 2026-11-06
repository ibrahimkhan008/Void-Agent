import { AgentCreateSchema } from "app-types/agent";
import { describe, expect, it } from "vitest";
import {
  hashAgentApprovalPayload,
  isValidAgentApprovalRequestKey,
} from "./agent-approval";

describe("agent approval idempotency inputs", () => {
  it("accepts bounded opaque tool-call keys and rejects controls or oversized keys", () => {
    expect(isValidAgentApprovalRequestKey("call_abc-123:xyz.4")).toBe(true);
    expect(isValidAgentApprovalRequestKey("bad key")).toBe(false);
    expect(isValidAgentApprovalRequestKey("bad\nkey")).toBe(false);
    expect(isValidAgentApprovalRequestKey("x".repeat(201))).toBe(false);
  });

  it("hashes the normalized agent payload and changes when approved content changes", () => {
    const first = AgentCreateSchema.parse({
      userId: "ignored-user",
      name: "Research",
      instructions: { role: "Analyst", systemPrompt: "Use primary sources." },
    });
    const same = AgentCreateSchema.parse({
      userId: "different-client-user",
      name: "Research",
      instructions: { role: "Analyst", systemPrompt: "Use primary sources." },
    });
    const changed = AgentCreateSchema.parse({
      userId: "ignored-user",
      name: "Research",
      instructions: { role: "Analyst", systemPrompt: "Use any sources." },
    });

    expect(hashAgentApprovalPayload(first)).toBe(
      hashAgentApprovalPayload(same),
    );
    expect(hashAgentApprovalPayload(first)).not.toBe(
      hashAgentApprovalPayload(changed),
    );
  });

  it("binds a pinned model to the approved agent payload", () => {
    const base = {
      userId: "ignored-user",
      name: "Research",
      instructions: { role: "Analyst", systemPrompt: "Use primary sources." },
    };
    const pinned = AgentCreateSchema.parse({
      ...base,
      instructions: {
        ...base.instructions,
        model: "flare/openai/gpt-oss-120b",
      },
    });
    const changed = AgentCreateSchema.parse({
      ...base,
      instructions: { ...base.instructions, model: "google/Gemini 2.5 Flash" },
    });
    expect(hashAgentApprovalPayload(pinned)).not.toBe(
      hashAgentApprovalPayload(changed),
    );
  });
});
