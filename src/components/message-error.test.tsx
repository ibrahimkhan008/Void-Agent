// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./message-parts", () => ({
  AssistMessagePart: () => null,
  FileMessagePart: () => null,
  ReasoningPart: () => null,
  SourceUrlMessagePart: () => null,
  ToolMessagePart: () => null,
  UserMessagePart: () => null,
}));

import { ErrorMessage } from "./message";

afterEach(cleanup);

describe("ErrorMessage retry control", () => {
  test("invokes the supplied retry action", () => {
    const onRetry = vi.fn();
    render(
      <ErrorMessage error={new Error("Request failed")} onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("disables retry and announces recovery while checking the saved run", () => {
    render(
      <ErrorMessage
        error={new Error("Request failed")}
        onRetry={vi.fn()}
        recovery="checking"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Checking for a saved response",
    );
    expect(
      screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
