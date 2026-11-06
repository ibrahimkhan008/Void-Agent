// @vitest-environment jsdom
import React, { act, type ReactNode } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { markdownRenderSpy, markdownProps } = vi.hoisted(() => ({
  markdownRenderSpy: vi.fn(),
  markdownProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("react-markdown", () => ({
  default: (props: Record<string, unknown> & { children: string }) => {
    markdownRenderSpy(props.children);
    markdownProps.push(props);
    return null;
  },
}));

vi.mock("./pre-block", () => ({ PreBlock: () => null }));
vi.mock("ui/json-view", () => ({ default: () => null }));

import { Markdown } from "./markdown";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  markdownRenderSpy.mockClear();
  markdownProps.length = 0;
});

const mount = (node: ReactNode) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return (next: ReactNode) => act(() => root?.render(next));
};

describe("Markdown streaming rendering", () => {
  it("does not re-render settled blocks when only the growing tail changes", () => {
    const rerender = mount(
      <Markdown isStreaming>{"Settled paragraph.\n\nGrowing tail"}</Markdown>,
    );

    expect(markdownRenderSpy.mock.calls.map(([text]) => text)).toEqual([
      "Settled paragraph.",
      "Growing tail",
    ]);

    rerender(
      <Markdown isStreaming>
        {"Settled paragraph.\n\nGrowing tail with another token"}
      </Markdown>,
    );

    expect(markdownRenderSpy.mock.calls.map(([text]) => text)).toEqual([
      "Settled paragraph.",
      "Growing tail",
      "Growing tail with another token",
    ]);

    rerender(
      <Markdown>
        {"Settled paragraph.\n\nGrowing tail with another token"}
      </Markdown>,
    );

    // The tail re-renders once when streaming ends so code blocks can receive
    // their final syntax highlight; the earlier settled block never rerenders.
    expect(markdownRenderSpy.mock.calls.map(([text]) => text)).toEqual([
      "Settled paragraph.",
      "Growing tail",
      "Growing tail with another token",
      "Growing tail with another token",
    ]);
  });

  it("retains GFM and LaTeX plugins and leaves ReactMarkdown URL filtering enabled", () => {
    mount(<Markdown>{"| a | b |\n| - | - |\n| 1 | 2 |\n\n$e=mc^2$"}</Markdown>);

    expect(markdownProps).toHaveLength(2);
    for (const props of markdownProps) {
      expect(props.remarkPlugins).toHaveLength(2);
      expect(props.rehypePlugins).toHaveLength(1);
      // No rehypeRaw or custom URL transform is installed; ReactMarkdown's
      // safe default protocol filtering remains in effect.
      expect(props.urlTransform).toBeUndefined();
    }
  });
});
