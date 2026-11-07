import { describe, expect, it } from "vitest";
import { canEditProjectRole, resolveProjectRole } from "./policy";

const base = {
  projectOwnerUserId: "creator",
  teamOwnerId: "team-owner",
  teamMembershipRole: "member",
  projectMemberRole: undefined,
  userId: "team-member",
} as const;

describe("resolveProjectRole", () => {
  it("preserves existing team-wide access for legacy and team mode projects", () => {
    expect(resolveProjectRole({ ...base, accessMode: null })).toBe("editor");
    expect(resolveProjectRole({ ...base, accessMode: "team" })).toBe("editor");
    expect(
      resolveProjectRole({
        ...base,
        teamMembershipRole: "viewer",
        accessMode: "team",
      }),
    ).toBe("viewer");
  });

  it("requires both current team membership and an explicit role in selected mode", () => {
    expect(resolveProjectRole({ ...base, accessMode: "selected" })).toBeNull();
    expect(
      resolveProjectRole({
        ...base,
        accessMode: "selected",
        projectMemberRole: "viewer",
      }),
    ).toBe("viewer");
    expect(
      resolveProjectRole({
        ...base,
        accessMode: "selected",
        teamMembershipRole: undefined,
        projectMemberRole: "editor",
      }),
    ).toBeNull();
  });

  it("preserves the project creator's prior team role and team-owner precedence", () => {
    expect(
      resolveProjectRole({
        ...base,
        accessMode: "selected",
        userId: "creator",
        teamMembershipRole: "viewer",
      }),
    ).toBe("viewer");
    expect(
      resolveProjectRole({
        ...base,
        accessMode: "selected",
        userId: "team-owner",
        teamMembershipRole: undefined,
      }),
    ).toBe("owner");
  });
});

describe("canEditProjectRole", () => {
  it.each(["owner", "editor"])(
    "%s can associate a chat with a project",
    (role) => {
      expect(canEditProjectRole(role)).toBe(true);
    },
  );

  it("does not let a viewer associate their private chat with a project", () => {
    expect(canEditProjectRole("viewer")).toBe(false);
    expect(canEditProjectRole(null)).toBe(false);
  });
});
