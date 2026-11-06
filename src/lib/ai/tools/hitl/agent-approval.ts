import { createHash } from "node:crypto";
import { AgentCreateSchema } from "app-types/agent";
import type { z } from "zod";

export type AgentApprovalPayload = z.infer<typeof AgentCreateSchema>;

const AGENT_APPROVAL_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export function isValidAgentApprovalRequestKey(value: string): boolean {
  return AGENT_APPROVAL_KEY_PATTERN.test(value);
}

/** Hash only persisted agent fields; never trust a userId supplied by the UI. */
export function hashAgentApprovalPayload(
  payload: AgentApprovalPayload,
): string {
  const canonicalPayload = {
    name: payload.name,
    description: payload.description ?? null,
    icon: payload.icon ?? null,
    instructions: payload.instructions,
    visibility: payload.visibility ?? "private",
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalPayload))
    .digest("hex");
}
