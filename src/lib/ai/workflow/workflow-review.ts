import { createHash } from "node:crypto";

type ReviewNode = {
  id?: string;
  name?: string;
  kind?: string;
  nodeConfig?: Record<string, unknown> | null;
};

const MAX_EFFECTS = 30;
const MAX_TEXT = 1_000;
const MAX_REVIEW_BODY = 16_000;
const MAX_BODY_DEPTH = 16;
const MAX_BODY_NODES = 1_000;
const SUPPORTED_NON_EFFECTS = new Set([
  "input",
  "output",
  "condition",
  "note",
  "template",
]);
const SECRET_KEY =
  /(?:authorization|cookie|token|secret|password|api[-_]?key|credential)/iu;

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

export function getWorkflowGraphRevision(nodes: unknown[], edges: unknown[]) {
  const byId = (a: unknown, b: unknown) => {
    const first =
      a && typeof a === "object"
        ? String((a as { id?: unknown }).id ?? "")
        : "";
    const second =
      b && typeof b === "object"
        ? String((b as { id?: unknown }).id ?? "")
        : "";
    return first.localeCompare(second);
  };
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          nodes: [...nodes].sort(byId),
          edges: [...edges].sort(byId),
        }),
      ),
    )
    .digest("hex");
}

function bounded(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, MAX_TEXT);
}

function safeUrl(raw: unknown): {
  text: string;
  safe: boolean;
  sensitive: boolean;
} {
  if (typeof raw !== "string")
    return { text: "dynamic URL", safe: false, sensitive: false };
  try {
    const url = new URL(raw);
    const hasCredentials = Boolean(url.username || url.password);
    let sensitive = hasCredentials;
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_KEY.test(key)) {
        sensitive = true;
        url.searchParams.set(key, "[redacted]");
      }
    }
    url.username = "";
    url.password = "";
    return { text: bounded(url.toString()), safe: true, sensitive };
  } catch {
    return { text: "invalid or dynamic URL", safe: false, sensitive: false };
  }
}

function literalValue(value: unknown): value is string {
  return typeof value === "string";
}

function safeHeaders(value: unknown): {
  text: string;
  safe: boolean;
  sensitive: boolean;
} {
  if (!Array.isArray(value))
    return { text: "[]", safe: true, sensitive: false };
  const headers: Record<string, string> = {};
  let sensitive = false;
  for (const item of value) {
    if (!item || typeof item !== "object")
      return { text: "invalid headers", safe: false, sensitive };
    const header = item as { key?: unknown; value?: unknown };
    if (typeof header.key !== "string" || !literalValue(header.value))
      return { text: "dynamic headers", safe: false, sensitive };
    const credentialHeader = SECRET_KEY.test(header.key);
    sensitive ||= credentialHeader;
    headers[header.key.slice(0, 100)] = credentialHeader
      ? "[redacted]"
      : bounded(header.value);
  }
  return { text: bounded(headers), safe: true, sensitive };
}

function safeQuery(value: unknown): {
  text: string;
  safe: boolean;
  sensitive: boolean;
} {
  if (!Array.isArray(value))
    return { text: "[]", safe: true, sensitive: false };
  const query: Record<string, string> = {};
  let sensitive = false;
  for (const item of value) {
    if (!item || typeof item !== "object")
      return { text: "invalid query", safe: false, sensitive };
    const param = item as { key?: unknown; value?: unknown };
    if (typeof param.key !== "string" || !literalValue(param.value))
      return { text: "dynamic query", safe: false, sensitive };
    const credentialParam = SECRET_KEY.test(param.key);
    sensitive ||= credentialParam;
    query[param.key.slice(0, 100)] = credentialParam
      ? "[redacted]"
      : bounded(param.value);
  }
  return { text: bounded(query), safe: true, sensitive };
}

function redactBodySecrets(
  value: unknown,
  state: { nodes: number; sensitive: boolean },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_BODY_NODES || depth > MAX_BODY_DEPTH)
    throw new Error("Body is too complex to review");
  if (Array.isArray(value))
    return value.map((item) => redactBodySecrets(item, state, depth + 1));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      state.sensitive = true;
      result[key] = "[redacted]";
    } else {
      result[key] = redactBodySecrets(item, state, depth + 1);
    }
  }
  return result;
}

function safeBody(value: unknown): {
  text: string;
  safe: boolean;
  sensitive: boolean;
} {
  if (value === undefined)
    return { text: "(none)", safe: true, sensitive: false };
  if (typeof value !== "string")
    return { text: "dynamic body", safe: false, sensitive: false };
  if (value.length > MAX_REVIEW_BODY)
    return {
      text: "body omitted (too large to review safely)",
      safe: false,
      sensitive: false,
    };
  if (!value.trim()) return { text: "(empty)", safe: true, sensitive: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // Arbitrary text can embed credentials without a machine-detectable field name.
    // Do not echo or approve a body we cannot safely inspect.
    return {
      text: `non-JSON body omitted (${value.length} characters)`,
      safe: false,
      sensitive: false,
    };
  }
  const state = { nodes: 0, sensitive: false };
  try {
    const sanitized = redactBodySecrets(parsed, state);
    const text = JSON.stringify(sanitized);
    if (text.length > MAX_REVIEW_BODY)
      return {
        text: "body omitted (too large to review safely)",
        safe: false,
        sensitive: state.sensitive,
      };
    return { text, safe: true, sensitive: state.sensitive };
  } catch {
    return {
      text: "body omitted (too complex to review safely)",
      safe: false,
      sensitive: state.sensitive,
    };
  }
}

/** Returns bounded effects and any reason the workflow cannot be safely previewed. */
export function getWorkflowEffectReview(nodes: ReviewNode[]) {
  const effects: string[] = [];
  const issues: string[] = [];
  for (const node of nodes) {
    const config = node.nodeConfig ?? {};
    const label = bounded(node.name || node.kind || "Workflow step");
    if (node.kind === "llm") {
      const model = config.model;
      effects.push(
        `${label}: send workflow context to AI model ${bounded(model || "configured model")}`,
      );
      issues.push(
        `${label}: the LLM prompt may contain runtime workflow data and cannot be previewed exactly`,
      );
      continue;
    }
    if (node.kind === "tool") {
      const tool = config.tool as
        | {
            type?: unknown;
            serverName?: unknown;
            serverId?: unknown;
            id?: unknown;
            parameterSchema?: unknown;
          }
        | undefined;
      if (!tool || typeof tool.id !== "string" || !tool.id) {
        issues.push(`${label}: tool target is missing or invalid`);
        continue;
      }
      const target =
        tool.type === "mcp-tool"
          ? `MCP server ${bounded(tool.serverName || "unnamed")} (${bounded(tool.serverId || "unknown ID")}), tool ${bounded(tool.id)}`
          : tool.type === "app-tool"
            ? `Void-Agent tool ${bounded(tool.id)}`
            : `unsupported tool type ${bounded(tool.type || "unknown")}`;
      if (tool.type !== "mcp-tool" && tool.type !== "app-tool")
        issues.push(`${label}: ${target}`);
      else if (tool.parameterSchema)
        issues.push(
          `${label}: ${target} generates parameters at runtime and cannot be previewed exactly`,
        );
      else effects.push(`${label}: call ${target} with arguments {}`);
      continue;
    }
    if (node.kind === "http") {
      const method =
        typeof config.method === "string"
          ? config.method.toUpperCase()
          : "UNKNOWN";
      const url = safeUrl(config.url);
      const query = safeQuery(config.query);
      const headers = safeHeaders(config.headers);
      const body = safeBody(config.body);
      const validMethod = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
      ].includes(method);
      const hasLiteralSecrets =
        url.sensitive || query.sensitive || headers.sensitive || body.sensitive;
      if (
        !url.safe ||
        !query.safe ||
        !headers.safe ||
        !body.safe ||
        !validMethod ||
        hasLiteralSecrets
      ) {
        issues.push(
          `${label}: HTTP request arguments are dynamic or invalid and cannot be previewed exactly`,
        );
        if (hasLiteralSecrets)
          issues.push(
            `${label}: credential-like values are present in the workflow definition; move them to a protected connection instead`,
          );
      } else {
        effects.push(
          `${label}: ${method} ${url.text}; query=${query.text}; headers=${headers.text}; body=${body.text}`,
        );
      }
      continue;
    }
    if (SUPPORTED_NON_EFFECTS.has(node.kind ?? "")) continue;
    // Unknown/future node kinds must not be allowed to bypass review.
    issues.push(
      `${label}: unsupported workflow node type ${bounded(node.kind || "unknown")}`,
    );
  }
  if (effects.length > MAX_EFFECTS)
    issues.push("Workflow has too many external effects to review safely");
  return {
    effects: effects.slice(0, MAX_EFFECTS),
    issues: issues.slice(0, MAX_EFFECTS),
    reviewable: issues.length === 0,
  };
}

/** Safe, concise effect summary retained for consumers that only need the list. */
export function getWorkflowEffectManifest(nodes: ReviewNode[]) {
  const review = getWorkflowEffectReview(nodes);
  return review.effects.length
    ? review.effects
    : ["No external effects detected"];
}
