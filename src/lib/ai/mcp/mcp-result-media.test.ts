import { describe, expect, it } from "vitest";
import { prepareMcpToolResult } from "./mcp-result-media";

const image = (overrides: Record<string, unknown> = {}) => ({
  type: "image",
  mimeType: "image/png",
  data: "aGVsbG8=",
  ...overrides,
});

describe("prepareMcpToolResult", () => {
  it("extracts inline raster images and redacts their bytes in transcript output", () => {
    const result = {
      content: [{ type: "text", text: "Chart" }, image()],
      structuredContent: { rows: 2 },
      isError: false,
    };

    const prepared = prepareMcpToolResult(result);

    expect(prepared.imagePreviews).toEqual([
      { src: "data:image/png;base64,aGVsbG8=", mimeType: "image/png" },
    ]);
    expect(prepared.displayResult).toMatchObject({
      content: [
        { type: "text", text: "Chart" },
        { type: "image", data: "[inline image preview]" },
      ],
      structuredContent: { rows: 2 },
    });
    expect(JSON.stringify(prepared.displayResult)).not.toContain("aGVsbG8=");
  });

  it("does not load remote URLs, SVG, malformed base64, or oversized images", () => {
    const prepared = prepareMcpToolResult({
      content: [
        {
          type: "image",
          mimeType: "image/png",
          url: "https://track.test/x.png",
        },
        image({ mimeType: "image/svg+xml" }),
        image({ data: "%%%=" }),
        image({ data: "a".repeat(700_000) }),
      ],
    });

    expect(prepared.imagePreviews).toHaveLength(0);
    expect(JSON.stringify(prepared.displayResult)).not.toContain(
      "https://track.test",
    );
    expect(JSON.stringify(prepared.displayResult)).not.toContain(
      "a".repeat(100),
    );
  });

  it("caps previews and handles content arrays and MCP error results", () => {
    const prepared = prepareMcpToolResult({
      isError: true,
      content: [image(), image(), image(), image()],
    });
    const arrayResult = prepareMcpToolResult([image()]);

    expect(prepared.isError).toBe(true);
    expect(prepared.imagePreviews).toHaveLength(3);
    expect(arrayResult.displayResult).toEqual([
      { type: "image", mimeType: "image/png", data: "[inline image preview]" },
    ]);
    expect(arrayResult.imagePreviews).toHaveLength(1);
  });

  it("passes ordinary results through unchanged", () => {
    const result = { message: "done" };
    expect(prepareMcpToolResult(result)).toEqual({
      displayResult: result,
      imagePreviews: [],
      audioPreviews: [],
      resourceLinks: [],
      morphikPreviews: [],
      isError: false,
    });
  });

  it("extracts bounded allowlisted inline audio and redacts transcript bytes", () => {
    const result = {
      content: [{ type: "audio", mimeType: "audio/mpeg", data: "aGVsbG8=" }],
    };
    const prepared = prepareMcpToolResult(result);

    expect(prepared.audioPreviews).toEqual([
      { src: "data:audio/mpeg;base64,aGVsbG8=", mimeType: "audio/mpeg" },
    ]);
    expect(prepared.displayResult).toMatchObject({
      content: [{ data: "[inline audio preview]" }],
    });
    expect(JSON.stringify(prepared.displayResult)).not.toContain("aGVsbG8=");
  });

  it("omits unsupported, malformed, oversized, and excess audio previews", () => {
    const prepared = prepareMcpToolResult({
      content: [
        { type: "audio", mimeType: "audio/mpeg", data: "aGVsbG8=" },
        { type: "audio", mimeType: "audio/mpeg", data: "aGVsbG8=" },
        { type: "audio", mimeType: "audio/mpeg", data: "aGVsbG8=" },
        { type: "audio", mimeType: "audio/svg+xml", data: "aGVsbG8=" },
        { type: "audio", mimeType: "audio/wav", data: "%%%=" },
        {
          type: "audio",
          mimeType: "audio/wav",
          data: "A".repeat(2_800_000),
        },
      ],
    });

    expect(prepared.audioPreviews).toHaveLength(2);
    expect(JSON.stringify(prepared.displayResult)).not.toContain(
      "A".repeat(100),
    );
  });

  it("renders bounded HTTPS resource links only after explicit user action", () => {
    const prepared = prepareMcpToolResult({
      content: [
        {
          type: "resource_link",
          uri: "https://docs.example.test/page",
          name: "docs",
          title: "Project docs",
          description: "Useful reference",
        },
      ],
    });
    expect(prepared.resourceLinks).toEqual([
      {
        href: "https://docs.example.test/page",
        host: "docs.example.test",
        label: "Project docs",
        description: "Useful reference",
      },
    ]);
    expect(prepared.displayResult).toMatchObject({
      content: [{ uri: "[resource link preview]" }],
    });
  });

  it("omits unsafe, credentialed, malformed, and oversized resource URLs", () => {
    const prepared = prepareMcpToolResult({
      content: [
        { type: "resource_link", uri: "javascript:alert(1)" },
        { type: "resource_link", uri: "http://docs.example.test/page" },
        {
          type: "resource_link",
          uri: "https://user:secret@docs.example.test/",
        },
        {
          type: "resource_link",
          uri: `https://docs.example.test/${"a".repeat(2_100)}`,
        },
      ],
    });
    expect(prepared.resourceLinks).toHaveLength(0);
    expect(JSON.stringify(prepared.displayResult)).not.toContain("javascript:");
    expect(JSON.stringify(prepared.displayResult)).not.toContain("secret");
  });
});
