// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { COCKPIT_PROVIDERS } from "lib/cockpit/overview";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CockpitOverview } from "./cockpit-overview";

vi.mock("ui/card", async () => {
  const ReactModule = await import("react");
  return {
    Card: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardContent: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardDescription: ({ children, ...props }: React.ComponentProps<"p">) =>
      ReactModule.createElement("p", props, children),
    CardHeader: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardTitle: ({ children, ...props }: React.ComponentProps<"h2">) =>
      ReactModule.createElement("h2", props, children),
  };
});

vi.mock("ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({
      children,
      asChild,
      ...props
    }: React.ComponentProps<"button"> & { asChild?: boolean }) => {
      void asChild;
      return ReactModule.createElement("button", props, children);
    },
  };
});

const fetchMock = vi.fn();

describe("Cockpit overview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/teams")
        return { ok: true, json: async () => ({ teams: [] }) };
      if (url === "/api/cockpit/vercel/deployments")
        return { ok: true, json: async () => ({ projects: [] }) };
      if (url === "/api/cockpit/superlog/summary")
        return { ok: true, json: async () => ({ incidents: [] }) };
      return {
        ok: true,
        json: async () => ({
          connected: true,
          lastTestedAt: "2026-11-07T00:00:00.000Z",
          lastTestOk: true,
          canManage: false,
          apiKey: "must-not-be-rendered",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads only scoped status endpoints and presents provider links without secrets", async () => {
    render(<CockpitOverview />);

    expect(await screen.findByText("6 of 6 providers connected")).toBeTruthy();
    expect(screen.getAllByText("Connected and verified")).toHaveLength(6);
    expect(screen.queryByText("must-not-be-rendered")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Open dashboard" })[0]
        ?.getAttribute("href"),
    ).toBe(COCKPIT_PROVIDERS[0]?.href);

    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    for (const provider of COCKPIT_PROVIDERS)
      expect(requestedUrls).toContain(provider.statusEndpoint);
    expect(requestedUrls).toContain("/api/cockpit/stripe/summary");
    expect(requestedUrls).toContain("/api/cockpit/revolut/summary");
    expect(requestedUrls).toContain("/api/cockpit/vercel/deployments");
    expect(requestedUrls).toContain("/api/cockpit/superlog/summary");
    expect(
      await screen.findByText(
        "No deployment failures or open incidents were reported.",
      ),
    ).toBeTruthy();
  });

  it("loads selected-team operational data and presents provider alerts", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/teams")
        return {
          ok: true,
          json: async () => ({
            teams: [{ id: "team-1", name: "Alpha", role: "owner" }],
          }),
        };
      if (url === "/api/cockpit/vercel/deployments?teamId=team-1")
        return {
          ok: true,
          json: async () => ({
            projects: [
              { label: "Web", deploy: { id: "deploy-1", state: "ERROR" } },
            ],
          }),
        };
      if (url === "/api/cockpit/superlog/summary?teamId=team-1")
        return {
          ok: true,
          json: async () => ({ incidents: [] }),
        };
      return {
        ok: true,
        json: async () => ({
          connected: true,
          lastTestedAt: null,
          lastTestOk: true,
          canManage: false,
        }),
      };
    });
    render(<CockpitOverview />);
    fireEvent.change(await screen.findByLabelText("Connection scope"), {
      target: { value: "team-1" },
    });
    expect(await screen.findByText("Deployment failed: Web")).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/cockpit/vercel/deployments?teamId=team-1",
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/cockpit/superlog/summary?teamId=team-1",
    );
  });

  it("shows an unavailable state instead of claiming a failed request is disconnected", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/teams")
        return { ok: true, json: async () => ({ teams: [] }) };
      return { ok: false, json: async () => ({ error: "forbidden" }) };
    });

    render(<CockpitOverview />);

    await waitFor(() => {
      expect(screen.getAllByText("Status unavailable")).toHaveLength(6);
    });
    expect(screen.queryByText("Not connected")).toBeNull();
    expect(
      screen.getByText(
        "Latest deployment or incident data could not be loaded. Check the Vercel and Superlog dashboards.",
      ),
    ).toBeTruthy();
  });
});
