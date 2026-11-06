import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, props.children),
  };
});

import {
  type VoiceCaptureSummary,
  VoiceCaptureSummaryPanel,
  VoiceCaptureSummaryPanelView,
} from "./voice-capture-summary-panel";

const summary: VoiceCaptureSummary = {
  title: "Planning discussion",
  summary: "The team reviewed the next release.",
  actionItems: [{ text: "Share the draft", owner: "Ari", dueDate: null }],
  decisions: ["Keep the current launch date"],
  notes: ["Review again next week"],
};

function renderView(
  overrides: Partial<
    React.ComponentProps<typeof VoiceCaptureSummaryPanelView>
  > = {},
) {
  return renderToStaticMarkup(
    <VoiceCaptureSummaryPanelView
      summary={null}
      busy={false}
      error={null}
      onSummarize={() => undefined}
      {...overrides}
    />,
  );
}

describe("VoiceCaptureSummaryPanel", () => {
  it("does not request a summary before the user activates the button", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const markup = renderToStaticMarkup(
      <VoiceCaptureSummaryPanel deviceId="device-1" sessionId="capture-1" />,
    );
    expect(markup).toContain("Summarize transcript");
    expect(markup).toContain("not saved, sent, or executed");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows an accessible pending state", () => {
    const markup = renderView({ busy: true });
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Summarizing this transcript");
    expect(markup).toMatch(/Summarizing…[^<]*<\/button>/);
  });

  it("renders structured notes as a non-executable review", () => {
    const markup = renderView({ summary });
    expect(markup).toContain("Planning discussion");
    expect(markup).toContain("Share the draft");
    expect(markup).toContain("text only");
    expect(markup).toContain("Keep the current launch date");
    expect(markup).toContain("Review again next week");
    expect(markup).toContain("not saved, sent, or executed");
  });

  it("shows failures while keeping the summary request available to retry", () => {
    const markup = renderView({ error: "Summary provider is unavailable." });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Summary provider is unavailable.");
    expect(markup).toContain("Summarize transcript");
  });
});
