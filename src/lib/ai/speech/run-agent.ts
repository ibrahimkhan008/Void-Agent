import { callApprovedVoiceMcpToolAction } from "@/app/api/mcp/actions";
import { requestVoiceMcpApproval } from "./mcp-voice-approval";

export type VoiceAgentActionResult = {
  serverName: string;
  toolName: string;
  status: "approved" | "rejected" | "failed";
  result?: string;
  error?: string;
};

export type VoiceAgentResult = {
  agent: string;
  answer: string;
  actions?: VoiceAgentActionResult[];
};

type VoiceMcpProposal = {
  serverId: string;
  serverName: string;
  toolName: string;
  serverConfigFingerprint: string;
  payload: Record<string, unknown>;
};

const MAX_PROPOSALS = 3;
const MAX_PROPOSAL_BYTES = 16_000;
const MAX_ACTION_RESULT_CHARS = 12_000;

function isVoiceMcpProposal(value: unknown): value is VoiceMcpProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proposal = value as Record<string, unknown>;
  if (
    typeof proposal.serverId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      proposal.serverId,
    ) ||
    typeof proposal.serverName !== "string" ||
    proposal.serverName.length > 128 ||
    typeof proposal.toolName !== "string" ||
    proposal.toolName.length > 128 ||
    typeof proposal.serverConfigFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(proposal.serverConfigFingerprint) ||
    !proposal.payload ||
    typeof proposal.payload !== "object" ||
    Array.isArray(proposal.payload)
  ) {
    return false;
  }
  try {
    return (
      new TextEncoder().encode(JSON.stringify(proposal.payload)).byteLength <=
      MAX_PROPOSAL_BYTES
    );
  } catch {
    return false;
  }
}

function boundedResult(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, MAX_ACTION_RESULT_CHARS);
  } catch {
    return "The MCP tool returned a non-serializable result.";
  }
}

function getMcpActionError(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const result = value as Record<string, unknown>;
  if (result.isError !== true) return;
  const error = result.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim())
      return message.slice(0, 500);
  }
  return "The MCP tool reported that the action failed.";
}

/** Invoke a delegated agent through the same-origin authenticated voice route. */
export async function runVoiceAgent(input: {
  agent: unknown;
  question: unknown;
}): Promise<VoiceAgentResult> {
  if (
    typeof input.agent !== "string" ||
    input.agent.trim().length < 1 ||
    input.agent.length > 200 ||
    typeof input.question !== "string" ||
    input.question.trim().length < 1 ||
    input.question.length > 2_000
  ) {
    throw new Error(
      "Provide an agent and a question (up to 2,000 characters).",
    );
  }
  const response = await fetch("/api/voice/run-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: input.agent.trim(),
      question: input.question.trim(),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.message === "string"
        ? payload.message
        : payload && typeof payload.error === "string"
          ? payload.error
          : "The requested agent could not answer just now.",
    );
  }
  if (
    !payload ||
    typeof payload.agentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      payload.agentId,
    ) ||
    typeof payload.agent !== "string" ||
    typeof payload.answer !== "string" ||
    !Array.isArray(payload.proposals) ||
    payload.proposals.length > MAX_PROPOSALS ||
    !payload.proposals.every(isVoiceMcpProposal)
  ) {
    throw new Error("The requested agent returned an invalid response.");
  }

  const actions: VoiceAgentActionResult[] = [];
  for (const proposal of payload.proposals) {
    let approvalToken: string | null = null;
    try {
      approvalToken = await requestVoiceMcpApproval({
        agentId: payload.agentId,
        ...proposal,
        reviewLabel: `Delegated agent ${payload.agent} requests this MCP action.`,
      });
      if (!approvalToken) {
        actions.push({
          serverName: proposal.serverName,
          toolName: proposal.toolName,
          status: "rejected",
        });
        continue;
      }

      const result = await callApprovedVoiceMcpToolAction(
        payload.agentId,
        proposal.serverId,
        proposal.serverName,
        proposal.toolName,
        proposal.payload,
        approvalToken,
      );
      const actionError = getMcpActionError(result);
      actions.push(
        actionError
          ? {
              serverName: proposal.serverName,
              toolName: proposal.toolName,
              status: "failed",
              error: actionError,
            }
          : {
              serverName: proposal.serverName,
              toolName: proposal.toolName,
              status: "approved",
              result: boundedResult(result),
            },
      );
    } catch (error) {
      actions.push({
        serverName: proposal.serverName,
        toolName: proposal.toolName,
        status: "failed",
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "The approved action could not be completed.",
      });
    }
  }

  return {
    agent: payload.agent,
    answer: payload.answer,
    ...(actions.length ? { actions } : {}),
  };
}
