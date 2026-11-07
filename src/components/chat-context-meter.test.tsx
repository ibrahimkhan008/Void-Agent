/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

import { ChatContextMeter } from "./chat-context-meter";

afterEach(() => cleanup());

describe("ChatContextMeter", () => {
  it("shows an accessible usage meter for a known model and latest usage", () => {
    render(
      <ChatContextMeter
        usage={{
          inputTokens: 12_000,
          outputTokens: 500,
          totalTokens: 12_500,
          reasoningTokens: 200,
          cachedInputTokens: 2_000,
        }}
        model={{ provider: "openai", model: "GPT 5.5" }}
        maxTokens={100_000}
      />,
    );
    expect(
      screen.getByRole("button", { name: /13%.*openai\/GPT 5.5/i }),
    ).toBeTruthy();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("13");
    expect(screen.getByText("Cached input")).toBeTruthy();
    expect(screen.getByText("Reasoning")).toBeTruthy();
    expect(screen.getByText("12.5K / 100K")).toBeTruthy();
  });

  it("hides itself when model usage is missing or context size is unknown", () => {
    const { rerender, container } = render(
      <ChatContextMeter
        usage={{ inputTokens: 100, outputTokens: 20, totalTokens: 120 }}
        model={{ provider: "local", model: "private-model" }}
      />,
    );
    expect(container.firstChild).toBeNull();
    rerender(
      <ChatContextMeter
        usage={undefined}
        model={{ provider: "openai", model: "GPT 5.5" }}
        maxTokens={100_000}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
