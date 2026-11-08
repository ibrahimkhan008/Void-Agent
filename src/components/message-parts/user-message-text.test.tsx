import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("ui/avatar", async () => {
  const React = await import("react");
  return {
    Avatar: ({ children, ...props }: React.ComponentProps<"span">) =>
      React.createElement("span", props, children),
    AvatarImage: () => null,
    AvatarFallback: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});

vi.mock("ui/mcp-icon", async () => {
  const React = await import("react");
  return {
    MCPIcon: (props: React.ComponentProps<"svg">) =>
      React.createElement("svg", props),
  };
});
import { UserMessageText } from "./user-message-text";

describe("UserMessageText", () => {
  it("renders serialized composer mentions as inline chips and keeps plain text", () => {
    const text = "Use @agent(\"Research\") with @tool('web-search') now";
    const html = renderToStaticMarkup(<UserMessageText text={text} />);

    expect(html).toContain('data-mention-type="agent"');
    expect(html).toContain('data-mention-type="tool"');
    expect(html).toContain("@Research");
    expect(html).toContain("@web-search");
    expect(html).toContain("Use ");
    expect(html).toContain(" now");
  });
});
