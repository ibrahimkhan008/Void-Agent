import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, props.children),
  };
});

import {
  type ProjectCollaborator,
  ProjectCollaboratorsPanelView,
} from "./project-collaborators-panel";

const member: ProjectCollaborator = {
  userId: "member-1",
  name: "Ari Team",
  email: "ari@example.test",
  image: null,
  role: "viewer",
};

function renderView(
  overrides: Partial<
    React.ComponentProps<typeof ProjectCollaboratorsPanelView>
  > = {},
) {
  return renderToStaticMarkup(
    <ProjectCollaboratorsPanelView
      projectRole="owner"
      accessMode="team"
      members={[member]}
      eligibleMembers={[
        {
          userId: "member-2",
          name: "Sam Team",
          email: "sam@example.test",
          image: null,
        },
      ]}
      loading={false}
      error={null}
      pendingAction={null}
      selectedUserId="member-2"
      newRole="viewer"
      memberRoleDrafts={{}}
      onModeChange={() => undefined}
      onSelectUser={() => undefined}
      onRoleChange={() => undefined}
      onMemberRoleChange={() => undefined}
      onSaveMemberRole={() => undefined}
      onAdd={() => undefined}
      onRemove={() => undefined}
      onRetry={() => undefined}
      {...overrides}
    />,
  );
}

describe("ProjectCollaboratorsPanelView", () => {
  it("shows owner controls and collaborator roster", () => {
    const markup = renderView();
    expect(markup).toContain("Entire team");
    expect(markup).toContain("Selected collaborators");
    expect(markup).toContain("Add");
    expect(markup).toContain("Ari Team");
    expect(markup).toContain("Remove Ari Team");
  });

  it("shows inherited owners without offering role or removal controls", () => {
    const markup = renderView({
      members: [
        {
          userId: "team-owner",
          name: "Workspace owner",
          email: "owner@example.test",
          image: null,
          role: "owner",
          accessSource: "team",
        },
      ],
    });
    expect(markup).toContain("Workspace owner");
    expect(markup).toContain("Team owner");
    expect(markup).toContain("Owner");
    expect(markup).not.toContain('id="project-member-role-team-owner"');
    expect(markup).not.toContain("Remove Workspace owner");
  });

  it("lets an editor prepare and save a viewer or editor role for an existing member", () => {
    const markup = renderView({
      projectRole: "editor",
      memberRoleDrafts: { "member-1": "editor" },
    });
    expect(markup).toContain("Role for Ari Team");
    expect(markup).toContain("Save role");
  });

  it("shows pending role updates and disables the role control", () => {
    const markup = renderView({
      pendingAction: "role:member-1",
      memberRoleDrafts: { "member-1": "editor" },
    });
    expect(markup).toContain("Updating collaborator role");
    expect(markup).toMatch(/id="project-member-role-member-1"[^>]*disabled/);
  });

  it("shows a pending status and disables controls while saving", () => {
    const markup = renderView({ pendingAction: "mode" });
    expect(markup).toContain("Updating project access");
    expect(markup).toContain('aria-label="Project access mode"');
    expect(markup).toMatch(/aria-label="Project access mode"[^>]*disabled/);
  });

  it("shows request failures with a retry action", () => {
    const markup = renderView({
      error: "Only current team members can be added.",
    });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Only current team members can be added.");
    expect(markup).toContain("Retry");
  });

  it("keeps viewer controls read-only and explains the authorization limit", () => {
    const markup = renderView({ projectRole: "viewer" });
    expect(markup).toContain("You have view access");
    expect(markup).not.toContain("Add");
    expect(markup).not.toContain("Remove Ari Team");
    expect(markup).toMatch(/aria-label="Project access mode"[^>]*disabled/);
  });

  it("exposes initial load progress accessibly", () => {
    const markup = renderView({ loading: true });
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading collaborators");
  });
});
