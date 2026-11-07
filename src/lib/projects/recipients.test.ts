import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveProjectNotificationRecipientIds } from "./recipients";

describe("resolveProjectNotificationRecipientIds", () => {
  it("returns only the owner for a personal project", () => {
    expect(
      resolveProjectNotificationRecipientIds({
        projectOwnerId: "owner",
        teamId: null,
        accessMode: "team",
        teamMemberIds: ["other"],
        projectMemberIds: ["other"],
      }),
    ).toEqual(["owner"]);
  });

  it("uses current team access for team-wide projects", () => {
    expect(
      resolveProjectNotificationRecipientIds({
        projectOwnerId: "creator",
        teamId: "team",
        accessMode: "team",
        teamOwnerId: "team-owner",
        teamMemberIds: ["creator", "member", "team-owner"],
        projectMemberIds: ["explicit-only"],
      }),
    ).toEqual(["team-owner", "creator", "member"]);
  });

  it("restricts selected projects to team owner, current creator, and granted current members", () => {
    expect(
      resolveProjectNotificationRecipientIds({
        projectOwnerId: "creator",
        teamId: "team",
        accessMode: "selected",
        teamOwnerId: "team-owner",
        teamMemberIds: ["creator", "granted", "unselected"],
        projectMemberIds: ["granted", "former-member"],
      }),
    ).toEqual(["team-owner", "granted", "creator"]);
  });

  it("keeps a selected project owner included when the owner is the team owner", () => {
    expect(
      resolveProjectNotificationRecipientIds({
        projectOwnerId: "owner",
        teamId: "team",
        accessMode: "selected",
        teamOwnerId: "owner",
      }),
    ).toEqual(["owner"]);
  });
});
