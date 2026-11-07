const MAX_MCP_TOOL_RESULT_BYTES = 1024 * 1024;

export type BoundedMcpResultError = {
  isError: true;
  error: { name: "McpResultUnavailable" | "McpResultTooLarge"; message: string };
  content: [];
};

/**
 * MCP servers are external, so don't forward an unbounded or non-serializable
 * result into chat/API responses. Keep valid protocol results intact.
 */
export function boundMcpToolResult<T>(result: T): T | BoundedMcpResultError {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(result);
  } catch {
    return {
      isError: true,
      error: {
        name: "McpResultUnavailable",
        message: "MCP server returned a result that could not be safely displayed.",
      },
      content: [],
    };
  }

  if (serialized === undefined) {
    return {
      isError: true,
      error: {
        name: "McpResultUnavailable",
        message: "MCP server returned a result that could not be safely displayed.",
      },
      content: [],
    };
  }

  if (
    new TextEncoder().encode(serialized).byteLength > MAX_MCP_TOOL_RESULT_BYTES
  ) {
    return {
      isError: true,
      error: {
        name: "McpResultTooLarge",
        message:
          "MCP server returned a result above the 1 MiB display limit. Request a smaller result from the server.",
      },
      content: [],
    };
  }
  return result;
}
