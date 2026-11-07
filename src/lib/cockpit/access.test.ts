import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTeamRole: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("lib/projects/access", () => ({ getTeamRole: mocks.getTeamRole }));

import { resolveStripeScope } from "./access";

describe("resolveStripeScope", () => {
  beforeEach(() => mocks.getTeamRole.mockReset());

  it("keeps personal connections scoped to the authenticated user", async () => {
    const result = await resolveStripeScope("user-1", null);
    expect(result).toEqual({
      ok: true,
      scope: { userId: "user-1", teamId: null },
      canManage: true,
    });
    expect(mocks.getTeamRole).not.toHaveBeenCalled();
  });

  it.each(["owner", "editor"] as const)(
    "lets team %s manage a shared key",
    async (role) => {
      mocks.getTeamRole.mockResolvedValue(role);
      expect(await resolveStripeScope("user-1", "team-1")).toEqual({
        ok: true,
        scope: { userId: "user-1", teamId: "team-1" },
        canManage: true,
      });
    },
  );

  it("lets a viewer read a shared connection but not manage it", async () => {
    mocks.getTeamRole.mockResolvedValue("viewer");
    expect(await resolveStripeScope("user-1", "team-1")).toEqual({
      ok: true,
      scope: { userId: "user-1", teamId: "team-1" },
      canManage: false,
    });
  });

  it("rejects users outside the team", async () => {
    mocks.getTeamRole.mockResolvedValue(null);
    expect(await resolveStripeScope("user-1", "team-1")).toEqual({ ok: false });
  });
});
