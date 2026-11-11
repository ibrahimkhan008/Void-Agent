import { createHash } from "node:crypto";
import { assertDesktopMcpToolAllowed } from "@keinsaas/mcp-core/mcp-tool-policy";
import {
  MCPRemoteConfigZodSchema,
  type MCPServerConfig,
  MCPStdioConfigZodSchema,
  isMaybeRemoteConfig,
  isMaybeStdioConfig,
} from "@keinsaas/mcp-types";
import { stringifyBoundedJson } from "./bounded-json.js";

const MAX_CONFIG_CHARS = 16_384;
const MAX_ARGUMENT_CHARS = 32_768;
const RESERVED_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "SYSTEMROOT",
  "COMSPEC",
  "TEMP",
  "TMP",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("MCP configuration contains unsupported fields");
  }
}

/** Validate IPC-provided MCP configuration before it reaches a transport. */
export function parseDesktopMcpConfig(value: unknown): MCPServerConfig {
  stringifyBoundedJson(value, MAX_CONFIG_CHARS);
  if (!isRecord(value)) throw new Error("Invalid MCP configuration");

  if (isMaybeRemoteConfig(value)) {
    assertOnlyKeys(value, ["url", "headers"]);
    const parsed = MCPRemoteConfigZodSchema.safeParse(value);
    if (!parsed.success) throw new Error("Invalid remote MCP configuration");
    const url = new URL(parsed.data.url);
    if (
      parsed.data.url.length > 2_048 ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("Remote MCP requires a credential-free HTTPS URL");
    }
    const headers = parsed.data.headers ?? {};
    const forbiddenHeaders = new Set([
      "host",
      "connection",
      "content-length",
      "transfer-encoding",
      "upgrade",
    ]);
    for (const [name, headerValue] of Object.entries(headers)) {
      if (
        name.length > 100 ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) ||
        forbiddenHeaders.has(name.toLowerCase()) ||
        headerValue.length > 4_096
      ) {
        throw new Error("Remote MCP contains an invalid header");
      }
    }
    return { url: url.toString(), ...(parsed.data.headers ? { headers } : {}) };
  }

  if (isMaybeStdioConfig(value)) {
    assertOnlyKeys(value, ["command", "args", "env"]);
    const parsed = MCPStdioConfigZodSchema.safeParse(value);
    if (!parsed.success) throw new Error("Invalid local MCP configuration");
    if (
      parsed.data.command.trim().length === 0 ||
      parsed.data.command.length > 512 ||
      (parsed.data.args?.length ?? 0) > 32 ||
      parsed.data.args?.some((argument) => argument.length > 2_048)
    ) {
      throw new Error("Local MCP configuration exceeds its limits");
    }
    for (const [key, entry] of Object.entries(parsed.data.env ?? {})) {
      if (
        !/^[A-Z_][A-Z0-9_]{0,63}$/u.test(key) ||
        RESERVED_ENV_KEYS.has(key) ||
        entry.length > 4_096
      ) {
        throw new Error(
          "Local MCP configuration contains an invalid environment value",
        );
      }
    }
    return parsed.data;
  }

  throw new Error("Invalid MCP configuration");
}

export function parseDesktopToolCall(value: unknown): {
  toolName: string;
  params: Record<string, unknown>;
} {
  stringifyBoundedJson(value, MAX_ARGUMENT_CHARS);
  if (!isRecord(value)) throw new Error("Invalid MCP tool call");
  assertOnlyKeys(value, ["toolName", "params"]);
  if (typeof value.toolName !== "string" || value.toolName.length > 100) {
    throw new Error("Invalid MCP tool name");
  }
  assertDesktopMcpToolAllowed(value.toolName);
  const params = value.params === undefined ? {} : value.params;
  if (!isRecord(params))
    throw new Error("MCP tool arguments must be an object");
  stringifyBoundedJson(params, MAX_ARGUMENT_CHARS);
  return { toolName: value.toolName, params };
}

export function fingerprintDesktopMcpConfig(config: MCPServerConfig): string {
  const canonical =
    "url" in config
      ? {
          url: new URL(config.url).toString(),
          headers: Object.fromEntries(
            Object.entries(config.headers ?? {}).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ),
        }
      : {
          command: config.command,
          args: config.args ?? [],
          env: Object.fromEntries(
            Object.entries(config.env ?? {}).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ),
        };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function isTrustedMcpPage(input: {
  hasWindow: boolean;
  windowDestroyed: boolean;
  senderMatches: boolean;
  mainFrameMatches: boolean;
  frameUrl: string;
  appOrigin: string;
}): boolean {
  if (
    !input.hasWindow ||
    input.windowDestroyed ||
    !input.senderMatches ||
    !input.mainFrameMatches
  )
    return false;
  try {
    const url = new URL(input.frameUrl);
    return (
      url.origin === input.appOrigin &&
      /^\/mcp\/test\/[^/]+\/?$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const SENSITIVE_KEY =
  /(token|secret|password|credential|api.?key|authorization|cookie)/iu;

/** Hide likely credentials in the native confirmation dialog, retaining shape. */
export function redactDesktopMcpReviewValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 16) return "[depth limit]";
  if (Array.isArray(value)) {
    return value.map((entry) => redactDesktopMcpReviewValue(entry, depth + 1));
  }
  if (!isRecord(value)) {
    if (typeof value === "string" && /^Bearer\s+\S+/iu.test(value)) {
      return "Bearer [redacted]";
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? "[redacted]"
        : redactDesktopMcpReviewValue(entry, depth + 1),
    ]),
  );
}

export function formatLocalMcpCommandForReview(config: {
  command: string;
  args?: string[];
}): string {
  const args = config.args ?? [];
  let redactNext = false;
  const safeArgs = args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return "[redacted]";
    }
    if (
      /^--?(token|secret|password|api[-_]?key|authorization|cookie)$/iu.test(
        arg,
      )
    ) {
      redactNext = true;
      return arg;
    }
    if (
      /^--?(token|secret|password|api[-_]?key|authorization|cookie)=/iu.test(
        arg,
      )
    ) {
      return `${arg.slice(0, arg.indexOf("=") + 1)}[redacted]`;
    }
    return arg;
  });
  const safeCommand =
    /(?:token|secret|password|api.?key|authorization|cookie)/iu.test(
      config.command,
    )
      ? "[redacted executable path]"
      : config.command;
  return [safeCommand, ...safeArgs].join(" ").slice(0, 700);
}
