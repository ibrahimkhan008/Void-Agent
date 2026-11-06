import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: {
      type?: "button" | "submit" | "reset";
      disabled?: boolean;
      onClick?: () => void;
      children?: React.ReactNode;
    }) =>
      createElement(
        "button",
        { type: props.type, disabled: props.disabled, onClick: props.onClick },
        props.children,
      ),
  };
});

import { VoiceTranscriptReviewPanel } from "./voice-transcript-review-panel";

describe("VoiceTranscriptReviewPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not classify on display; the intent preview is opt-in", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const markup = renderToStaticMarkup(
      <VoiceTranscriptReviewPanel
        messageId="00000000-0000-4000-8000-000000000001"
        transcript="Send an email to Alex"
        sending={false}
        onCancel={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Preview intent");
    expect(markup).toContain("Send to assistant");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
