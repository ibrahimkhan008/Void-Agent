// @vitest-environment jsdom
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveTeamSelector } from "./active-team-selector";

const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

async function renderSelector() {
  await act(async () => {
    root.render(<ActiveTeamSelector />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function selectMeteringTeam(value: string) {
  const select = container.querySelector(
    'select[aria-label="Team used for metering"]',
  ) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ActiveTeamSelector", () => {
  it("loads the session team context and available memberships safely", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            {
              id: "team-1",
              name: "Research",
              role: "member",
              canManage: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ activeTeamId: "team-1" }));

    await renderSelector();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/teams",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/user/active-team",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe(
      "team-1",
    );
    expect(container.textContent).toContain("usage metering only");
    expect(container.textContent).toContain(
      "It does not grant team access or change permissions",
    );
  });

  it("saves a selected membership as metering context without changing roles", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            {
              id: "team-1",
              name: "Research",
              role: "member",
              canManage: false,
            },
            { id: "team-2", name: "Design", role: "viewer", canManage: false },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ activeTeamId: null }))
      .mockResolvedValueOnce(response({ activeTeamId: "team-2" }));

    await renderSelector();
    await act(async () => {
      selectMeteringTeam("team-2");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/user/active-team",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "team-2" }),
      }),
    );
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe(
      "team-2",
    );
    expect(container.textContent).toContain(
      "Team context updated for usage metering.",
    );
  });

  it("clears metering context with a null team ID", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ teams: [{ id: "team-1", name: "Research" }] }),
      )
      .mockResolvedValueOnce(response({ activeTeamId: "team-1" }))
      .mockResolvedValueOnce(response({ activeTeamId: null }));
    await renderSelector();
    await act(async () => {
      selectMeteringTeam("");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/user/active-team",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ teamId: null }),
      }),
    );
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe(
      "",
    );
  });

  it("keeps the prior selection and reports failure when saving is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            { id: "team-1", name: "Research", role: "owner", canManage: true },
            { id: "team-2", name: "Design", role: "member", canManage: false },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ activeTeamId: "team-1" }))
      .mockResolvedValueOnce(response({ error: "Forbidden" }, 403));

    await renderSelector();
    await act(async () => {
      selectMeteringTeam("team-2");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((container.querySelector("select") as HTMLSelectElement).value).toBe(
      "team-1",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Forbidden",
    );
  });
});
