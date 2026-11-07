import type { N8nWorkflowDefinition } from "./client";

export type N8nWorkflowReadOnlySummary = {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
  nodes: Array<{ name: string; type: string }>;
};

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const label = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(
      /\b(authorization|cookie|token|secret|password|api[-_]?key|credential|private[-_]?key)\b\s*[:=]\s*[^\s,;]+/giu,
      "$1=[redacted]",
    )
    .trim()
    .slice(0, 120);
  return label || fallback;
}

/** Return only display-safe metadata; never send n8n parameters or credentials to the browser. */
export function toN8nWorkflowReadOnlySummary(
  workflow: N8nWorkflowDefinition,
): N8nWorkflowReadOnlySummary {
  return {
    id: workflow.id,
    name: safeLabel(workflow.name, "Unnamed workflow"),
    active: workflow.active,
    description:
      typeof workflow.description === "string"
        ? safeLabel(workflow.description, "") || null
        : null,
    nodes: workflow.nodes.slice(0, 200).map((node, index) => ({
      name: safeLabel(node.name, `Step ${index + 1}`),
      type: safeLabel(node.type, "Unknown action"),
    })),
  };
}
