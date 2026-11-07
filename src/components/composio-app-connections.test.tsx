// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

import { ComposioAppConnections } from "./composio-app-connections";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Composio app connections UI", () => {
  it("loads the user's connections and starts provider authorization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ redirectUrl: "https://connect.example/oauth" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
    render(<ComposioAppConnections />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://connect.example/oauth"),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/integrations/composio",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires confirmation and refreshes after a disconnect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            configured: true,
            toolkits: [],
            accounts: [
              { id: "account-1", toolkit: "github", status: "ACTIVE" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ configured: true, toolkits: [], accounts: [] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<ComposioAppConnections />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByText("github")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
