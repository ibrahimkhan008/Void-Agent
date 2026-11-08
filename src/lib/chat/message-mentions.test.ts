import { describe, expect, it } from "vitest";
import {
  parseMessageMentions,
  truncateMessageMentions,
} from "./message-mentions";

describe("parseMessageMentions", () => {
  it("preserves surrounding text and parses composer agent, MCP, tool and workflow labels", () => {
    const text =
      'Ask @agent("Research Agent") then @mcp("Docs") and @tool("search") or @workflow("Review")';
    const parts = parseMessageMentions(text);
    expect(parts.filter((part) => part.type !== "text")).toMatchObject([
      { type: "agent", name: "Research Agent" },
      { type: "mcp", name: "Docs" },
      { type: "tool", name: "search" },
      { type: "workflow", name: "Review" },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it("supports single-quoted default-tool labels and quotes inside names", () => {
    expect(parseMessageMentions("@tool('web-search')")[0]).toMatchObject({
      type: "tool",
      name: "web-search",
      quote: "'",
    });
    expect(parseMessageMentions('@agent("R&D "North"")')[0]).toMatchObject({
      type: "agent",
      name: 'R&D "North"',
    });
  });

  it("leaves malformed and newline-spanning mention text untouched", () => {
    const text = '@agent("unfinished)\n@tool("also unfinished)';
    expect(parseMessageMentions(text)).toEqual([
      { type: "text", text, start: 0 },
    ]);
  });
});

describe("truncateMessageMentions", () => {
  it("extends a collapsed preview to avoid cutting a mention in half", () => {
    const text = 'before @agent("Research Agent") after';
    expect(truncateMessageMentions(text, 12)).toBe(
      'before @agent("Research Agent")...',
    );
  });

  it("matches ordinary truncation when no mention crosses the limit", () => {
    expect(truncateMessageMentions("abcdefghij", 5)).toBe("abcde...");
    expect(truncateMessageMentions("short", 10)).toBe("short");
  });
});
