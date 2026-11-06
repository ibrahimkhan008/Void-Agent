import { createHash } from "node:crypto";
import type { N8nWorkflowDefinition } from "./client";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function getN8nWorkflowRevision(
  workflow: N8nWorkflowDefinition,
): string {
  const definition = {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? null,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(definition)))
    .digest("hex");
}

const SAFE_NODE_TYPES = new Set([
  "n8n-nodes-base.start",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.merge",
  "n8n-nodes-base.noOp",
  "n8n-nodes-base.set",
]);

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

/** Summarize workflow steps without returning credentials, paths, expressions, or raw node parameters. */
export function getN8nWorkflowEffectManifest(workflow: N8nWorkflowDefinition) {
  const nodes = workflow.nodes.slice(0, 200);
  const effects = nodes.flatMap((node) => {
    const type = safeLabel(node.type, "unknown node");
    const name = safeLabel(node.name, "Unnamed step");
    const params = node.parameters ?? {};
    let destination = "";
    if (
      type === "n8n-nodes-base.httpRequest" &&
      typeof params.url === "string" &&
      !/[{}]/u.test(params.url)
    ) {
      try {
        const url = new URL(params.url);
        destination = ` to ${url.host}`;
      } catch {
        destination = " to a configured HTTP destination";
      }
    }
    const classification = SAFE_NODE_TYPES.has(type)
      ? "logic"
      : "action or integration";
    return [`${name}: ${classification} (${type})${destination}`];
  });
  const visible = effects.slice(0, 30);
  if (workflow.nodes.length > visible.length)
    visible.push(
      `${workflow.nodes.length - visible.length} additional steps omitted`,
    );
  return visible.length ? visible : ["No workflow steps were found"];
}

/** Expose only the run acknowledgement ID; n8n responses may contain execution data. */
export function getN8nRunAcknowledgement(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { accepted: true };
  const record = value as Record<string, unknown>;
  const nested =
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : undefined;
  const id = [
    record.executionId,
    record.id,
    nested?.executionId,
    nested?.id,
  ].find(
    (candidate) =>
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= 128,
  );
  return {
    accepted: true,
    ...(typeof id === "string" ? { executionId: id } : {}),
  };
}
