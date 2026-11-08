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
import { CockpitUpdates } from "./cockpit-updates";

const fetchMock = vi.fn();

describe("CockpitUpdates", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/notifications?")) {
        return {
          ok: true,
          json: async () => ({
            notifications: [
              {
                id: "update-1",
                type: "agent_update_alert",
                title: "Build failed",
                body: "Production deployment needs review.",
                href: "/cockpit/vercel",
                readAt: null,
                createdAt: "2026-11-08T10:00:00.000Z",
              },
              {
                id: "update-external",
                type: "agent_update_warning",
                title: "Unsafe destination",
                body: null,
                href: "//attacker.example",
                readAt: null,
                createdAt: "2026-11-08T09:00:00.000Z",
              },
              {
                id: "unrelated",
                type: "project_brain_run_completed",
                title: "Not a cockpit update",
                body: null,
                href: null,
                readAt: null,
                createdAt: "2026-11-08T08:00:00.000Z",
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ updated: 1 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads only persisted agent updates, shows severity and rejects unsafe links", async () => {
    render(<CockpitUpdates />);

    expect(await screen.findByText("Build failed")).toBeTruthy();
    expect(screen.queryByText("Not a cockpit update")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open" }).getAttribute("href"),
    ).toBe("/cockpit/vercel");
    expect(screen.getAllByText("Unsafe destination")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(1);
    expect(screen.getByLabelText("alert severity")).toBeTruthy();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "type=agent_update_info%2Cagent_update_warning%2Cagent_update_alert",
    );
    expect(url).toContain("limit=8");
    expect(options.cache).toBe("no-store");
  });

  it("marks an update read through the owner-scoped inbox endpoint", async () => {
    render(<CockpitUpdates />);
    const title = await screen.findByText("Build failed");
    const row = title.closest("li");
    if (!row) throw new Error("Update row not rendered");
    fireEvent.click(row.querySelector("button")!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/read",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["update-1"] }),
        }),
      );
    });
    expect(await screen.findByLabelText("Read")).toBeTruthy();
  });
});
