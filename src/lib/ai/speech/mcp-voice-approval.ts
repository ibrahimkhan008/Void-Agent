export type VoiceMcpApprovalDraft = {
  agentId?: string;
  serverId: string;
  serverName: string;
  toolName: string;
  serverConfigFingerprint?: string;
  payload: Record<string, unknown>;
  reviewLabel?: string;
};

const SECRET_FIELD =
  /(?:password|passwd|secret|token|api[-_]?key|authorization|credential)/i;

function maskSensitiveFields(value: unknown): {
  value: unknown;
  found: boolean;
} {
  if (Array.isArray(value)) {
    let found = false;
    const masked = value.map((item) => {
      const result = maskSensitiveFields(item);
      found ||= result.found;
      return result.value;
    });
    return { value: masked, found };
  }
  if (!value || typeof value !== "object") return { value, found: false };
  let found = false;
  const masked = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (SECRET_FIELD.test(key)) {
        found = true;
        return [key, "[redacted; exact value shown in next review]"];
      }
      const result = maskSensitiveFields(nested);
      found ||= result.found;
      return [key, result.value];
    }),
  );
  return { value: masked, found };
}

type ApprovalDependencies = {
  confirmAction: (message: string) => boolean;
  fetcher: typeof fetch;
};

export function stripMcpApprovalField<
  T extends { properties?: Record<string, unknown>; required?: string[] },
>(schema: T, approvalField: string | undefined): T {
  if (!approvalField) return schema;
  const properties = { ...(schema.properties ?? {}) };
  delete properties[approvalField];
  return {
    ...schema,
    properties,
    required: (schema.required ?? []).filter(
      (field) => field !== approvalField,
    ),
  };
}

export async function requestVoiceMcpApproval(
  draft: VoiceMcpApprovalDraft,
  dependencies: ApprovalDependencies = {
    confirmAction: (message) => window.confirm(message),
    fetcher: fetch.bind(globalThis),
  },
): Promise<string | null> {
  const {
    reviewLabel = "Voice assistant requests this MCP action.",
    ...approvalDraft
  } = draft;
  if (
    typeof approvalDraft.serverConfigFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(approvalDraft.serverConfigFingerprint)
  ) {
    throw new Error(
      "MCP server configuration changed; reload the voice session and try again.",
    );
  }
  const payload = JSON.parse(JSON.stringify(draft.payload)) as Record<
    string,
    unknown
  >;
  const review = JSON.stringify(payload, null, 2);
  const masked = maskSensitiveFields(payload);
  const reviewed = dependencies.confirmAction(
    `${reviewLabel}\n\nServer: ${draft.serverName}\nTool: ${draft.toolName}\n\n${masked.found ? `Arguments (secret-like fields hidden):\n${JSON.stringify(masked.value, null, 2)}\n\nThe next dialog will show the exact values before approval.` : `Exact arguments:\n${review}`}\n\n${masked.found ? "Review this action?" : "Approve this action?"}`,
  );
  if (!reviewed) return null;
  if (
    masked.found &&
    !dependencies.confirmAction(
      `${reviewLabel}\n\nExact arguments to send to ${draft.serverName} / ${draft.toolName}:\n${review}\n\nApprove this exact action?`,
    )
  ) {
    return null;
  }

  const response = await dependencies.fetcher("/api/approvals/mcp-tool", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...approvalDraft, payload }),
  });
  const result = (await response.json().catch(() => null)) as {
    approvalToken?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || typeof result?.approvalToken !== "string") {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Could not authorize this voice MCP action",
    );
  }
  return result.approvalToken;
}
