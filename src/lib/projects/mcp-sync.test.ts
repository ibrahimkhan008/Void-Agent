import { describe, expect, it } from "vitest";
import {
  boundedMcpTextResult,
  isApprovedProjectReadOnlyTool,
  validateMcpToolArguments,
} from "./mcp-sync";

const readTool = {
  name: "lookup",
  description: "Read information",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", maxLength: 30 },
      limit: { type: "integer" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

describe("project MCP read-only sync validation", () => {
  it("requires both explicit read-only annotation and the stored tool allowlist", () => {
    expect(isApprovedProjectReadOnlyTool(readTool, ["lookup"])).toBe(true);
    expect(isApprovedProjectReadOnlyTool(readTool, ["other"])).toBe(false);
    expect(
      isApprovedProjectReadOnlyTool({ ...readTool, annotations: undefined }, [
        "lookup",
      ]),
    ).toBe(false);
    expect(
      isApprovedProjectReadOnlyTool(
        { ...readTool, annotations: { readOnlyHint: false } },
        ["lookup"],
      ),
    ).toBe(false);
  });

  it("accepts only bounded arguments matching the advertised schema", () => {
    expect(
      validateMcpToolArguments(readTool, { query: "alpha", limit: 5 }),
    ).toBe(true);
    expect(validateMcpToolArguments(readTool, { query: "x".repeat(31) })).toBe(
      false,
    );
    expect(
      validateMcpToolArguments(readTool, { query: "alpha", extra: true }),
    ).toBe(false);
    expect(validateMcpToolArguments(readTool, {})).toBe(false);
    expect(
      validateMcpToolArguments({ ...readTool, inputSchema: undefined }, {}),
    ).toBe(false);
  });

  it("keeps only text results, rejects tool errors, and enforces the source bound", () => {
    expect(
      boundedMcpTextResult({
        content: [
          { type: "text", text: "facts" },
          { type: "image", data: "secret" },
        ],
      }),
    ).toBe("facts");
    expect(
      boundedMcpTextResult({
        isError: true,
        content: [{ type: "text", text: "not knowledge" }],
      }),
    ).toBeNull();
    expect(
      boundedMcpTextResult(
        { content: [{ type: "text", text: "abcdefgh" }] },
        4,
      ),
    ).toBe("abcd");
  });
});
