import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({
      variant: _variant,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
      ReactModule.createElement("button", props, props.children),
  };
});
vi.mock("ui/input", async () => {
  const ReactModule = await import("react");
  return {
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      ReactModule.createElement("input", props),
  };
});
vi.mock("ui/label", async () => {
  const ReactModule = await import("react");
  return {
    Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) =>
      ReactModule.createElement("label", props, props.children),
  };
});

import { UserModelProvidersSettings } from "./user-model-providers-settings";

const provider = {
  id: "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
  name: "Private endpoint",
  baseUrl: "https://models.example/v1",
  modelIds: ["model-a", "model-b"],
  capabilities: {
    "model-a": { supportsToolCalling: false },
    "model-b": { supportsToolCalling: false },
  },
  hasApiKey: true,
};

describe("user model provider capability settings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires explicit per-model tool opt-in when updating a discovered provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ providers: [provider] }))
      .mockResolvedValueOnce(Response.json({ provider }))
      .mockResolvedValueOnce(Response.json({ providers: [provider] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UserModelProvidersSettings />);
    await screen.findByText("Private endpoint");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Private endpoint" }),
    );
    const toolToggle = screen.getByRole("checkbox", {
      name: "Enable tool calling for model-a",
    });
    expect(toolToggle).toHaveProperty("checked", false);
    fireEvent.click(toolToggle);
    fireEvent.click(
      screen.getByRole("button", { name: "Update and rediscover models" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const updateBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(updateBody.capabilities).toEqual({
      "model-a": { supportsToolCalling: true },
      "model-b": { supportsToolCalling: false },
    });
  });
});
