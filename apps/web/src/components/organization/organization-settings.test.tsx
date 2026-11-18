// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  org: { id: "org-1", name: "Personal workspace", slug: "personal" },
  organizations: [{ id: "org-1" }, { id: "org-2" }],
  members: [
    {
      id: "member-owner",
      userId: "user-1",
      role: "owner",
      user: { name: "Owner", email: "owner@example.test" },
    },
    {
      id: "member-2",
      userId: "user-2",
      role: "member",
      user: { name: "Member", email: "member@example.test" },
    },
  ],
  invitations: [
    {
      id: "invite-1",
      email: "new@example.test",
      role: "member",
      status: "pending",
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
  ],
  mutate: vi.fn(async () => undefined),
}));

const auth = vi.hoisted(() => ({
  list: vi.fn(async () => ({ data: fixtures.organizations })),
  getFullOrganization: vi.fn(async () => ({ data: fixtures.org })),
  listMembers: vi.fn(async () => ({ data: { members: fixtures.members } })),
  listInvitations: vi.fn(async () => ({ data: fixtures.invitations })),
  inviteMember: vi.fn(async () => ({ data: { id: "invite-2" } })),
  cancelInvitation: vi.fn(async () => ({ data: { success: true } })),
  removeMember: vi.fn(async () => ({ data: { success: true } })),
  getInvitation: vi.fn(async () => ({
    data: { organizationName: "Team", email: "invitee@example.test" },
  })),
  acceptInvitation: vi.fn(async () => ({
    data: { member: { organizationId: "org-2" } },
  })),
  rejectInvitation: vi.fn(async () => ({ data: { success: true } })),
  setActive: vi.fn(async () => ({ data: { success: true } })),
}));

vi.mock("auth/client", () => ({ authClient: { organization: auth } }));
vi.mock("swr", () => ({
  default: (key: unknown) => ({
    data:
      key === "active-organization"
        ? fixtures.org
        : key === "user-organizations"
          ? fixtures.organizations
          : Array.isArray(key) && key[0] === "organization-members"
            ? fixtures.members
            : Array.isArray(key) && key[0] === "organization-invitations"
              ? fixtures.invitations
              : undefined,
    error: undefined,
    isLoading: false,
    mutate: fixtures.mutate,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { useWorkspaceSwitcher } from "@/hooks/use-workspace-switcher";
import { AcceptOrganizationInvitation } from "./accept-invitation";
import { OrganizationSettings } from "./organization-settings";

describe("organization UI flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "http://localhost:3000",
        assign: vi.fn(),
        reload: vi.fn(),
      },
    });
  });
  afterEach(() => cleanup());

  it("sends and cancels invitations from the active workspace", async () => {
    render(<OrganizationSettings userId="user-1" />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: " NEW@Example.Test " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() =>
      expect(auth.inviteMember).toHaveBeenCalledWith({
        email: "new@example.test",
        role: "member",
        organizationId: "org-1",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(auth.cancelInvitation).toHaveBeenCalledWith({
        invitationId: "invite-1",
      }),
    );
  });

  it("does not allow managers to remove themselves and removes another member only after confirmation", async () => {
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn(() => true),
    });
    render(<OrganizationSettings userId="user-1" />);
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(1);
    fireEvent.click(removeButtons[0]);
    await waitFor(() =>
      expect(auth.removeMember).toHaveBeenCalledWith({
        memberIdOrEmail: "member-2",
        organizationId: "org-1",
      }),
    );
    expect(window.confirm).toHaveBeenCalled();
  });

  it("loads an invitation and supports declining it", async () => {
    render(<AcceptOrganizationInvitation invitationId="invite-1" />);
    await screen.findByText("Join Team");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(auth.rejectInvitation).toHaveBeenCalledWith({
        invitationId: "invite-1",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Invitation declined.",
    );
  });

  it("accepts an invitation and switches to its organization", async () => {
    render(<AcceptOrganizationInvitation invitationId="invite-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );
    await waitFor(() =>
      expect(auth.acceptInvitation).toHaveBeenCalledWith({
        invitationId: "invite-1",
      }),
    );
    await waitFor(() =>
      expect(auth.setActive).toHaveBeenCalledWith({ organizationId: "org-2" }),
    );
    expect(window.location.assign).toHaveBeenCalledWith("/");
  });

  it("keeps the invitation page open when workspace activation fails", async () => {
    auth.setActive.mockResolvedValueOnce({
      error: { message: "switch unavailable" },
    } as never);
    render(<AcceptOrganizationInvitation invitationId="invite-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "switch unavailable",
    );
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("lists workspaces and switches the active workspace", async () => {
    const { result } = renderHook(() => useWorkspaceSwitcher("org-1"));
    expect(result.current.organizations).toEqual(fixtures.organizations);
    await act(async () => result.current.switchWorkspace("org-2"));
    expect(auth.setActive).toHaveBeenCalledWith({ organizationId: "org-2" });
    expect(window.location.reload).toHaveBeenCalled();
  });
});
