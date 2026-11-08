// @vitest-environment jsdom
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamMembersSettings } from "./team-members-settings";

const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

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

describe("TeamMembersSettings", () => {
  it("lets a user select a team and add a registered account with a role", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            { id: "team-1", name: "Research", role: "owner", canManage: true },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ invitations: [] }))
      .mockResolvedValueOnce(
        response({ member: { userId: "user-2", role: "viewer" } }, 201),
      );
    await act(async () => {
      root.render(<TeamMembersSettings />);
      await Promise.resolve();
    });

    const email = container.querySelector(
      'input[type="email"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(email, "reader@example.test");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      email.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const role = container.querySelector(
      'select[aria-label="Role"]',
    ) as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(role, "viewer");
      role.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/team-1/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "reader@example.test", role: "viewer" }),
      }),
    );
    expect(container.textContent).toContain(
      "Add a registered account immediately. To invite someone who does not have access yet, use the invitation form below.",
    );
    expect(container.textContent).toContain("was added to the team as viewer");
  });

  it("shows read-only access for ordinary team members", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        teams: [
          { id: "team-1", name: "Research", role: "editor", canManage: false },
        ],
      }),
    );
    await act(async () => {
      root.render(<TeamMembersSettings />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Only this team's owner and admins can add members.",
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it("shows authorization and duplicate errors returned by the server", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            { id: "team-1", name: "Research", role: "member", canManage: true },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ invitations: [] }))
      .mockResolvedValueOnce(response({ error: "Forbidden" }, 403));
    await act(async () => {
      root.render(<TeamMembersSettings />);
      await Promise.resolve();
    });
    const email = container.querySelector(
      'input[type="email"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(email, "reader@example.test");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      email.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Forbidden",
    );
  });

  it("creates an invitation, explains delivery, and lets the manager copy its one-time link", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            { id: "team-1", name: "Research", role: "owner", canManage: true },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ invitations: [] }))
      .mockResolvedValueOnce(
        response(
          {
            invitation: {
              id: "invite-1",
              email: "new@example.test",
              role: "viewer",
              status: "pending",
              expiresAt: "2026-11-15T00:00:00.000Z",
            },
            acceptUrl: "https://void-agent.test/accept-invitation/invite-1",
            deliveryStatus: "disabled",
          },
          201,
        ),
      )
      .mockResolvedValueOnce(response({ invitations: [] }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      root.render(<TeamMembersSettings />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const email = container.querySelector(
      'input[aria-label="Invite email"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(email, "new@example.test");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      email.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const role = container.querySelector(
      'select[aria-label="Invitation role"]',
    ) as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(role, "viewer");
      role.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const form = Array.from(container.querySelectorAll("form")).at(-1);
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/team-1/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.test", role: "viewer" }),
      }),
    );
    expect(container.textContent).toContain(
      "Email delivery is disabled. Copy the invitation link and share it directly.",
    );
    expect(
      (
        container.querySelector(
          'input[aria-label="Invitation link"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("https://void-agent.test/accept-invitation/invite-1");
    await act(async () => {
      container
        .querySelector('button[type="button"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(
      "https://void-agent.test/accept-invitation/invite-1",
    );
    expect(container.textContent).toContain("Invitation link copied.");
  });

  it("lists pending invitations and revokes the selected invitation", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          teams: [
            { id: "team-1", name: "Research", role: "owner", canManage: true },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          invitations: [
            {
              id: "invite-1",
              email: "pending@example.test",
              role: "member",
              status: "pending",
              expiresAt: "2026-11-15T00:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ invitation: { id: "invite-1" } }))
      .mockResolvedValueOnce(response({ invitations: [] }));
    await act(async () => {
      root.render(<TeamMembersSettings />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("pending@example.test");
    await act(async () => {
      container
        .querySelector(
          'button[aria-label="Revoke invitation for pending@example.test"]',
        )
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/team-1/invitations/invite-1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(container.textContent).toContain("Invitation revoked.");
    expect(container.textContent).toContain("No pending invitations.");
  });
});
