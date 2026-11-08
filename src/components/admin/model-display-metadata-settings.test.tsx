import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const React = await import("react");
  return {
    Button: ({ children, ...props }: React.ComponentProps<"button">) =>
      React.createElement("button", props, children),
  };
});
vi.mock("ui/input", async () => {
  const React = await import("react");
  return {
    Input: (props: React.ComponentProps<"input">) =>
      React.createElement("input", props),
  };
});
vi.mock("ui/switch", async () => {
  const React = await import("react");
  return {
    Switch: ({
      checked,
      onCheckedChange,
      ...props
    }: {
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
    } & React.ComponentProps<"button">) =>
      React.createElement("button", {
        ...props,
        role: "switch",
        "aria-checked": checked,
        onClick: () => onCheckedChange(!checked),
      }),
  };
});
import { ModelDisplayMetadataSettings } from "./model-display-metadata-settings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelDisplayMetadataSettings", () => {
  it("edits and saves public model metadata through the admin config API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            config: { models: { modelDisplayMetadata: {} } },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ModelDisplayMetadataSettings />);
    fireEvent.change(await screen.findByLabelText("Provider ID"), {
      target: { value: "OpenAI" },
    });
    fireEvent.change(screen.getByLabelText("Model name"), {
      target: { value: "gpt-4.1" },
    });
    fireEvent.change(screen.getByLabelText("Developer"), {
      target: { value: "OpenAI" },
    });
    fireEvent.change(screen.getByLabelText("Country code"), {
      target: { value: "us" },
    });
    fireEvent.change(screen.getByLabelText("Input USD / million tokens"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Output USD / million tokens"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Hidden gem" }));
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(screen.getByText("openai/gpt-4.1")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Save catalog metadata" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(options.body as string)).toEqual({
      key: "models",
      settings: {
        modelDisplayMetadata: {
          "openai/gpt-4.1": {
            developer: "OpenAI",
            country: "US",
            hiddenGem: true,
            caution: false,
            notRecommended: false,
            cheapAlternative: false,
            speed: false,
            thinking: false,
            maxPerformance: false,
            inputPriceUsd: 0.5,
            outputPriceUsd: 1.5,
          },
        },
      },
    });
  });

  it("saves explicit Personal Auto task scores with the catalog entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            config: { models: { modelDisplayMetadata: {} } },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ModelDisplayMetadataSettings />);
    fireEvent.change(await screen.findByLabelText("Provider ID"), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByLabelText("Model name"), {
      target: { value: "gpt-5.5" },
    });
    fireEvent.change(screen.getByLabelText("Coding"), {
      target: { value: "80" },
    });
    fireEvent.change(
      screen.getByLabelText("Automatic routing priority (lower first)"),
      {
        target: { value: "5" },
      },
    );
    fireEvent.change(screen.getByLabelText("Admin-verified context tokens"), {
      target: { value: "128000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save catalog metadata" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(options.body as string)).toEqual({
      key: "models",
      settings: {
        modelDisplayMetadata: {
          "openai/gpt-5.5": {
            caution: false,
            cheapAlternative: false,
            hiddenGem: false,
            maxPerformance: false,
            notRecommended: false,
            speed: false,
            thinking: false,
            automaticRoutingPriority: 5,
            automaticRoutingContextTokens: 128000,
            automaticRoutingScores: { coding: 80 },
          },
        },
      },
    });
  });
});
