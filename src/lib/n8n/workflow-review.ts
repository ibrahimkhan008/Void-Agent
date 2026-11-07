import { createHash } from "node:crypto";
import type { N8nWorkflowDefinition } from "./client";

const MAX_NODES = 200;
const MAX_EFFECTS = 30;
const MAX_EFFECT_PREVIEW_BYTES = 4_000;
const MAX_TOTAL_PREVIEW_BYTES = 12_000;
const MAX_VALUE_DEPTH = 12;
const MAX_VALUE_NODES = 500;
const MAX_STRING = 1_000;

const SAFE_NODE_TYPES = new Set([
  "n8n-nodes-base.start",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.merge",
  "n8n-nodes-base.noOp",
  "n8n-nodes-base.set",
]);
const SECRET_KEY =
  /(?:authorization|cookie|token|secret|password|api[-_]?key|credential|private[-_]?key|signature)/iu;
const SECRET_TEXT =
  /\b(authorization|cookie|token|secret|password|api[-_]?key|credential|private[-_]?key|signature)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|Bearer\s+[^\s,;&"']+|[^\s,;&"']+)/giu;
const EXPRESSION =
  /(?:=\{\{|\{\{|\$json\b|\$node\b|\$env\b|\$execution\b|\$workflow\b|\$now\b|\$today\b)/u;

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

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(
      /\b(authorization|cookie|token|secret|password|api[-_]?key|credential)\b\s*[:=]\s*[^\s,;]+/giu,
      "$1=[redacted]",
    )
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

function sanitizeValue(
  value: unknown,
  state: {
    nodes: number;
    sensitive: boolean;
    dynamic: boolean;
    oversized: boolean;
  },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_VALUE_NODES || depth > MAX_VALUE_DEPTH)
    throw new Error("Effect configuration is too complex to review");
  if (typeof value === "string") {
    if (EXPRESSION.test(value)) state.dynamic = true;
    if (value.length > MAX_STRING) state.oversized = true;
    const boundedValue = value.slice(0, MAX_STRING);
    if (/^\s*[\[{]/u.test(boundedValue)) {
      try {
        return JSON.stringify(
          sanitizeValue(JSON.parse(boundedValue), state, depth + 1),
        );
      } catch {
        // Keep scanning malformed JSON-like text for credential patterns.
      }
    }
    return boundedValue.replace(SECRET_TEXT, (_match, key: string) => {
      state.sensitive = true;
      return `${key}=[redacted]`;
    });
  }
  if (Array.isArray(value))
    return value.map((item) => {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).name === "string" &&
        Object.hasOwn(item, "value") &&
        SECRET_KEY.test((item as Record<string, unknown>).name as string)
      ) {
        state.sensitive = true;
        return Object.fromEntries(
          Object.entries(item).map(([key, entry]) => [
            key.slice(0, 100),
            key === "value"
              ? "[redacted]"
              : sanitizeValue(entry, state, depth + 1),
          ]),
        );
      }
      return sanitizeValue(item, state, depth + 1);
    });
  if (!value || typeof value !== "object") {
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return value;
    throw new Error("Effect configuration contains an unsupported value");
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      state.sensitive = true;
      result[key.slice(0, 100)] = "[redacted]";
    } else {
      if (key.length > 100) state.oversized = true;
      result[key.slice(0, 100)] = sanitizeValue(item, state, depth + 1);
    }
  }
  return result;
}

function sanitizeHttpUrl(raw: unknown): {
  preview?: string;
  issue?: string;
  sensitive: boolean;
} {
  if (typeof raw !== "string" || !raw.trim())
    return {
      issue: "HTTP URL is missing or not a literal URL",
      sensitive: false,
    };
  if (raw.length > MAX_STRING)
    return {
      issue: "HTTP URL exceeds the safe review size",
      sensitive: false,
    };
  if (EXPRESSION.test(raw))
    return {
      issue: "HTTP URL is dynamic and cannot be reviewed exactly",
      sensitive: false,
    };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return {
        issue: "HTTP URL uses an unsupported protocol",
        sensitive: false,
      };
    let sensitive = Boolean(url.username || url.password);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_KEY.test(key)) {
        sensitive = true;
        url.searchParams.set(key, "[redacted]");
      }
    }
    url.hash = "";
    return {
      preview: url.toString(),
      sensitive,
    };
  } catch {
    return {
      issue: "HTTP URL is invalid and cannot be reviewed",
      sensitive: false,
    };
  }
}

export type N8nWorkflowEffectReview = {
  effects: string[];
  issues: string[];
  reviewable: boolean;
};

/**
 * Only workflows composed of explicitly understood logic and literal HTTP
 * requests can be run after this review. Other integration nodes are blocked
 * until a node-specific review adapter can describe their full effects.
 */
export function getN8nWorkflowEffectReview(
  workflow: N8nWorkflowDefinition,
): N8nWorkflowEffectReview {
  const effects: string[] = [];
  const issues: string[] = [];
  const nodes = workflow.nodes;
  if (nodes.length > MAX_NODES)
    issues.push(`Workflow has more than ${MAX_NODES} nodes`);

  for (const node of nodes.slice(0, MAX_NODES)) {
    const type = safeLabel(node.type, "unknown node");
    const name = safeLabel(node.name, "Unnamed step");
    if (SAFE_NODE_TYPES.has(type)) continue;
    if (type !== "n8n-nodes-base.httpRequest") {
      issues.push(`${name}: unsupported action type ${type}`);
      continue;
    }

    const params = node.parameters ?? {};
    const method =
      typeof params.method === "string" ? params.method.toUpperCase() : "GET";
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
      issues.push(`${name}: HTTP method is missing or unsupported`);
      continue;
    }
    const url = sanitizeHttpUrl(params.url);
    if (url.issue) {
      issues.push(`${name}: ${url.issue}`);
      continue;
    }
    if (url.sensitive) {
      issues.push(`${name}: URL contains credential-like data`);
      continue;
    }

    const state = {
      nodes: 0,
      sensitive: false,
      dynamic: false,
      oversized: false,
    };
    let sanitized: unknown;
    try {
      sanitized = sanitizeValue(params, state);
    } catch {
      issues.push(`${name}: HTTP parameters are too complex to review safely`);
      continue;
    }
    if (state.sensitive) {
      issues.push(
        `${name}: inline credential-like values are not permitted; use a protected credential`,
      );
      continue;
    }
    if (state.dynamic) {
      issues.push(
        `${name}: HTTP parameters contain expressions and cannot be reviewed exactly`,
      );
      continue;
    }
    if (state.oversized) {
      issues.push(`${name}: HTTP parameters exceed the safe review size`);
      continue;
    }

    const credentialConfig = (
      node as typeof node & {
        credentials?: Record<string, unknown>;
      }
    ).credentials;
    if (credentialConfig && Object.keys(credentialConfig).length > 20) {
      issues.push(`${name}: too many credentials to review safely`);
      continue;
    }
    const credentials = credentialConfig
      ? Object.keys(credentialConfig).slice(0, 20).sort()
      : [];
    const credentialSummary = credentials.length
      ? `; credentials=${JSON.stringify(credentials.map((key) => `${key}: [configured]`))}`
      : "";
    const effect = `${name}: HTTP ${method} ${url.preview}; reviewed parameters=${JSON.stringify(sanitized)}${credentialSummary}`;
    const effectBytes = Buffer.byteLength(effect, "utf8");
    const totalEffectBytes = effects.reduce(
      (sum, existing) => sum + Buffer.byteLength(existing, "utf8"),
      0,
    );
    if (
      effectBytes > MAX_EFFECT_PREVIEW_BYTES ||
      totalEffectBytes + effectBytes > MAX_TOTAL_PREVIEW_BYTES
    ) {
      issues.push(`${name}: HTTP effect preview exceeds the safe review size`);
      continue;
    }
    effects.push(effect);
  }

  if (effects.length > MAX_EFFECTS)
    issues.push(`Workflow has more than ${MAX_EFFECTS} external effects`);
  if (nodes.length > MAX_NODES)
    issues.push(
      `${nodes.length - MAX_NODES} additional nodes were not reviewed`,
    );
  return {
    effects: effects.slice(0, MAX_EFFECTS),
    issues: issues.slice(0, MAX_EFFECTS),
    reviewable: issues.length === 0,
  };
}

/** Backward-compatible display helper; approval must use the structured review. */
export function getN8nWorkflowEffectManifest(workflow: N8nWorkflowDefinition) {
  const review = getN8nWorkflowEffectReview(workflow);
  return review.effects.length
    ? review.effects
    : ["No external effects detected"];
}

/** Expose only a bounded execution acknowledgement; n8n may return execution data. */
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
