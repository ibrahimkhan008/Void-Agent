// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadInsightsPanel } from "./thread-insights-panel";

afterEach(cleanup);

describe("ThreadInsightsPanel", () => {
  it("labels and warns when stored insights no longer match the conversation", () => {
    render(
      <ThreadInsightsPanel
        threadId="thread-1"
        initial={{
          summary: "An old summary.",
          decisions: [],
          actionItems: [],
          generatedAt: "2026-11-10T10:00:00.000Z",
          sourceMessageCount: 4,
          sourceLastMessageId: "message-4",
          currentMessageCount: 5,
          currentLastMessageId: "message-5",
        }}
      />,
    );

    expect(screen.getByTestId("thread-insights-trigger").textContent).toContain(
      "Stale insights",
    );
    fireEvent.click(screen.getByTestId("thread-insights-trigger"));
    expect(
      screen.getByTestId("thread-insights-stale-notice").textContent,
    ).toContain("out of date");
    expect(screen.getByText("An old summary.")).toBeTruthy();
    expect(screen.getByTestId("thread-insights-refresh")).toBeTruthy();
  });
});
