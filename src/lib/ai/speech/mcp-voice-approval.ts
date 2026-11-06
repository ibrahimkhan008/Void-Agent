export type VoiceMcpApprovalDraft = {
  serverId: string;
  serverName: string;
  toolName: string;
  payload: Record<string, unknown>;
  reviewLabel?: string;
};

type ApprovalDependencies = {
  confirmAction: (message: string) => boolean;
  fetcher: typeof fetch;
};

export function stripMcpApprovalField<T extends { properties?: Record<string, unknown>; required?: string[] }>(
  schema: T,
  approvalField: string | undefined,
): T {
  if (!approvalField) return schema;
  const properties = { ...(schema.properties ?? {}) };
  delete properties[approvalField];
  return {
    ...schema,
    properties,
    required: (schema.required ?? []).filter((field) => field !== approvalField),
  };
}

export async function requestVoiceMcpApproval(
  draft: VoiceMcpApprovalDraft,
  dependencies: ApprovalDependencies = {
    confirmAction: (message) => window.confirm(message),
    fetcher: fetch.bind(globalThis),
  },
): Promise<string | null> {
  const { reviewLabel = "Voice assistant requests this MCP action.", ...approvalDraft } = draft;
  const payload = JSON.parse(JSON.stringify(draft.payload)) as Record<string, unknown>;
  const review = JSON.stringify(payload, null, 2);
  const approved = dependencies.confirmAction(
    `${reviewLabel}\n\nServer: ${draft.serverName}\nTool: ${draft.toolName}\n\nExact arguments:\n${review}\n\nApprove this action?`,
  );
  if (!approved) return null;

  const response = await dependencies.fetcher("/api/approvals/mcp-tool", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...approvalDraft, payload }),
  });
  const result = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
  if (!response.ok || typeof result?.approvalToken !== "string") {
    throw new Error(typeof result?.error === "string" ? result.error : "Could not authorize this voice MCP action");
  }
  return result.approvalToken;
}
