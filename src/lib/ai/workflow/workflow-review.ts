import { createHash } from "node:crypto";

type ReviewNode = {
  id?: string;
  name?: string;
  kind?: string;
  nodeConfig?: Record<string, unknown> | null;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function getWorkflowGraphRevision(nodes: unknown[], edges: unknown[]) {
  const byId = (a: unknown, b: unknown) => {
    const first = a && typeof a === "object" ? String((a as { id?: unknown }).id ?? "") : "";
    const second = b && typeof b === "object" ? String((b as { id?: unknown }).id ?? "") : "";
    return first.localeCompare(second);
  };
  return createHash("sha256").update(JSON.stringify(canonicalize({ nodes: [...nodes].sort(byId), edges: [...edges].sort(byId) }))).digest("hex");
}

/** Safe, concise effects summary for a human approval card. Never includes URL paths, headers, bodies, or credentials. */
export function getWorkflowEffectManifest(nodes: ReviewNode[]) {
  const effects = nodes.flatMap((node) => {
    const config = node.nodeConfig ?? {};
    if (node.kind === "tool") {
      const tool = config.tool as { type?: string; serverName?: string; id?: string } | undefined;
      if (!tool) return [];
      return [`${node.name || "Tool step"}: ${tool.type === "mcp-tool" ? `MCP server ${tool.serverName || "(unnamed)"}, tool ${tool.id || "(unnamed)"}` : `Void-Agent tool ${tool.id || "(unnamed)"}`}`];
    }
    if (node.kind === "http") {
      const method = typeof config.method === "string" ? config.method : "HTTP";
      const url = config.url;
      let destination = "dynamic destination";
      if (typeof url === "string") {
        try { destination = new URL(url).host; } catch { destination = "configured destination"; }
      }
      return [`${node.name || "HTTP step"}: ${method} request to ${destination}`];
    }
    return [];
  });
  return effects.length ? effects.slice(0, 30) : ["No external tool or HTTP actions detected"];
}
