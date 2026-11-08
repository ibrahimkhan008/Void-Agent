import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("ui/json-view", () => ({
  default: ({ data }: { data: unknown }) => (
    <pre data-testid="result-json">{JSON.stringify(data)}</pre>
  ),
}));

import { McpToolResult } from "./mcp-tool-result";

describe("McpToolResult", () => {
  it("renders bounded inline images and visibly labels MCP errors", () => {
    const markup = renderToStaticMarkup(
      <McpToolResult
        result={{
          isError: true,
          content: [{ type: "image", mimeType: "image/png", data: "aGVsbG8=" }],
        }}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("MCP server reported that this tool call failed");
    expect(markup).toContain('src="data:image/png;base64,aGVsbG8="');
    expect(markup).not.toContain('"data":"aGVsbG8="');
  });

  it("never turns a server-provided URL into an image request", () => {
    const markup = renderToStaticMarkup(
      <McpToolResult
        result={{
          content: [
            {
              type: "image",
              mimeType: "image/png",
              url: "https://tracking.example/image.png",
            },
          ],
        }}
      />,
    );

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("tracking.example");
  });

  it("renders bounded MCP audio using a user-controlled player", () => {
    const markup = renderToStaticMarkup(
      <McpToolResult
        result={{
          content: [
            { type: "audio", mimeType: "audio/mpeg", data: "aGVsbG8=" },
          ],
        }}
      />,
    );

    expect(markup).toContain("<audio");
    expect(markup).toContain("controls");
    expect(markup).toContain('preload="none"');
    expect(markup).toContain("data:audio/mpeg;base64,aGVsbG8=");
    expect(markup).not.toContain('"data":"aGVsbG8="');
  });

  it("renders resource links as explicit external links with safe rel attributes", () => {
    const markup = renderToStaticMarkup(
      <McpToolResult
        result={{
          content: [
            {
              type: "resource_link",
              uri: "https://docs.example.test/reference",
              title: "Reference",
            },
          ],
        }}
      />,
    );
    expect(markup).toContain('href="https://docs.example.test/reference"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("docs.example.test");
    expect(markup).not.toContain('src="https://docs.example.test/reference"');
  });
});
