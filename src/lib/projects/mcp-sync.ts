import type { MCPToolInfo } from "app-types/mcp";

const MAX_DEPTH = 8;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 10_000;

export function isApprovedProjectReadOnlyTool(
  tool: MCPToolInfo,
  allowedToolNames: string[],
) {
  return (
    tool.annotations?.readOnlyHint === true &&
    allowedToolNames.includes(tool.name)
  );
}

/** Conservative JSON Schema subset for validating caller supplied MCP arguments. */
export function validateMcpToolArguments(
  tool: MCPToolInfo,
  value: unknown,
): value is Record<string, unknown> {
  const schema = tool.inputSchema;
  return validateJsonSchemaArguments(schema, value);
}

export function validateJsonSchemaArguments(
  schema: unknown,
  value: unknown,
): value is Record<string, unknown> {
  if (
    !schema ||
    typeof schema !== "object" ||
    (schema as { type?: unknown }).type !== "object" ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    return false;
  const rootSchema = schema as Record<string, any>;
  const root = value as Record<string, unknown>;
  if (Object.keys(root).length > MAX_OBJECT_KEYS) return false;
  const valid = (s: any, v: unknown, depth: number): boolean => {
    if (depth > MAX_DEPTH) return false;
    if (
      s?.enum &&
      (!Array.isArray(s.enum) ||
        !s.enum.some((entry: unknown) => Object.is(entry, v)))
    )
      return false;
    if (!s?.type) return true;
    switch (s.type) {
      case "object": {
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        const obj = v as Record<string, unknown>;
        const props = s.properties ?? {};
        if (Object.keys(obj).length > MAX_OBJECT_KEYS) return false;
        if ((s.required ?? []).some((key: string) => !(key in obj)))
          return false;
        if (
          s.additionalProperties === false &&
          Object.keys(obj).some((key) => !(key in props))
        )
          return false;
        return Object.entries(obj).every(([key, item]) =>
          key in props ? valid(props[key], item, depth + 1) : true,
        );
      }
      case "array":
        return (
          Array.isArray(v) &&
          v.length <= 100 &&
          v.every((item) => valid(s.items ?? {}, item, depth + 1))
        );
      case "string":
        return (
          typeof v === "string" &&
          v.length <=
            Math.min(s.maxLength ?? MAX_STRING_LENGTH, MAX_STRING_LENGTH) &&
          (!s.enum || s.enum.includes(v))
        );
      case "integer":
        return Number.isSafeInteger(v);
      case "number":
        return typeof v === "number" && Number.isFinite(v);
      case "boolean":
        return typeof v === "boolean";
      case "null":
        return v === null;
      default:
        return false;
    }
  };
  return valid(rootSchema, root, 0);
}

export function boundedMcpTextResult(
  result: unknown,
  maxChars = 60_000,
): string | null {
  if (
    !result ||
    typeof result !== "object" ||
    (result as { isError?: unknown }).isError === true
  )
    return null;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((part) => {
    if (
      !part ||
      typeof part !== "object" ||
      (part as { type?: unknown }).type !== "text"
    )
      return [];
    const text = (part as { text?: unknown }).text;
    if (typeof text === "string") return [text];
    if (text !== undefined) {
      try {
        return [JSON.stringify(text)];
      } catch {
        return [];
      }
    }
    return [];
  });
  const joined = parts.join("\n").trim();
  return joined ? joined.slice(0, maxChars) : null;
}

export function boundedComposioTextResult(
  result: unknown,
  maxChars = 60_000,
): string | null {
  if (!result || typeof result !== "object") return null;
  const envelope = result as {
    successful?: unknown;
    isError?: unknown;
    error?: unknown;
  };
  if (
    envelope.successful === false ||
    envelope.isError === true ||
    envelope.error
  )
    return null;
  try {
    const text = JSON.stringify(result);
    return text && text !== "{}" ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
