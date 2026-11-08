// @vitest-environment jsdom
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("auth/client", () => ({
  authClient: {
    useSession: mocks.useSession,
    signOut: mocks.signOut,
  },
}));

import { TeamInvitationAcceptance } from "./team-invitation-acceptance";

const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mocks.useSession.mockReset().mockReturnValue({
    data: { user: { id: "user-1" } },
    isPending: false,
  });
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/team-invitations/accept");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("TeamInvitationAcceptance", () => {
  it("submits a fragment token to the authenticated API and removes it after success", async () => {
    window.history.replaceState(
      null,
      "",
      "/team-invitations/accept#token=one-time-secret-token-value-123456",
    );
    fetchMock.mockResolvedValueOnce(response({ accepted: true }));

    await act(async () => {
      root.render(<TeamInvitationAcceptance />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/team-invitations/accept",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ token: "one-time-secret-token-value-123456" }),
      }),
    );
    expect(window.location.hash).toBe("");
    expect(
      window.sessionStorage.getItem("void-agent:pending-team-invitation"),
    ).toBeNull();
    expect(container.textContent).toContain("You joined the team.");
  });

  it("retains the invite after wrong-account rejection so the user can switch accounts", async () => {
    const token = "one-time-secret-token-value-123456";
    window.history.replaceState(
      null,
      "",
      `/team-invitations/accept#token=${token}`,
    );
    fetchMock.mockResolvedValueOnce(
      response(
        { error: "Invalid or expired invitation for this account." },
        400,
      ),
    );

    await act(async () => {
      root.render(<TeamInvitationAcceptance />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      window.sessionStorage.getItem("void-agent:pending-team-invitation"),
    ).toBe(token);
    expect(container.textContent).toContain("Sign in with the invited account");
  });
});
