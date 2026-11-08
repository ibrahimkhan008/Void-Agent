// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", () => ({
  Button: (
    props: React.ComponentProps<"button"> & { variant?: string; size?: string },
  ) => {
    const { variant: _variant, size: _size, ...buttonProps } = props;
    return <button {...buttonProps} />;
  },
}));
vi.mock("ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("lucide-react", () => ({
  ArrowLeft: "span",
  ArrowRight: "span",
  Bot: "span",
  Plug: "span",
  RefreshCw: "span",
  Workflow: "span",
}));

import { OnboardingWizard } from "./onboarding-wizard";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => vi.clearAllMocks());

describe("OnboardingWizard", () => {
  it("persists the setup step and connects through the existing Composio route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          configured: true,
          toolkits: [
            {
              slug: "github",
              name: "GitHub",
              isConnected: false,
              connectedAccountId: null,
            },
          ],
          accounts: [],
          nextCursor: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        json({ redirectUrl: "https://connect.example/oauth" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onNavigate = vi.fn();

    render(
      <OnboardingWizard initialStep="connect_tools" onNavigate={onNavigate} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith("https://connect.example/oauth"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/integrations/composio?limit=30",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/integrations/composio",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ toolkit: "github" }),
      }),
    );
  });

  it("disconnects by the account ID and refreshes the catalog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          configured: true,
          toolkits: [
            {
              slug: "github",
              name: "GitHub",
              isConnected: true,
              connectedAccountId: "account-1",
            },
          ],
          accounts: [{ id: "account-1", toolkit: "github", status: "ACTIVE" }],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(
        json({
          configured: true,
          toolkits: [],
          accounts: [],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<OnboardingWizard initialStep="connect_tools" />);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/integrations/composio",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ connectedAccountId: "account-1" }),
      }),
    );
  });

  it("allows skipping when Composio is not configured and saves done state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          configured: false,
          toolkits: [],
          accounts: [],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onNavigate = vi.fn();
    render(
      <OnboardingWizard initialStep="connect_tools" onNavigate={onNavigate} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Skip for now" }),
    );

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"));
    expect(screen.getByTestId("onboarding-composio-unconfigured")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/user/onboarding",
      expect.objectContaining({ body: JSON.stringify({ step: "done" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/onboarding/complete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("offers a direct setup skip from the overview", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onNavigate = vi.fn();
    render(
      <OnboardingWizard
        initialStep="automation_overview"
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("saves overview progress before opening the app setup step", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(
        json({
          configured: false,
          toolkits: [],
          accounts: [],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<OnboardingWizard initialStep="automation_overview" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect apps" }));

    expect(
      await screen.findByRole("heading", { name: "Connect your apps" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/user/onboarding",
      expect.objectContaining({
        body: JSON.stringify({ step: "connect_tools" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/integrations/composio?limit=30",
      expect.anything(),
    );
  });
});
