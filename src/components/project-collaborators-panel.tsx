"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";

export type CollaboratorRole = "viewer" | "editor";
export type ProjectAccessMode = "team" | "selected";

export type ProjectCollaborator = {
  userId: string;
  role: CollaboratorRole;
  name: string | null;
  email: string | null;
  image: string | null;
};

type CollaboratorData = {
  accessMode: ProjectAccessMode;
  members: ProjectCollaborator[];
  eligibleMembers: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }>;
};

type PendingAction =
  | "mode"
  | "member"
  | `remove:${string}`
  | `role:${string}`
  | null;

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // The API can return a plain-text authorization response.
  }
  const text = await response.text().catch(() => "");
  return text || fallback;
}

export function ProjectCollaboratorsPanelView({
  projectRole,
  accessMode,
  members,
  eligibleMembers,
  loading,
  error,
  pendingAction,
  selectedUserId,
  newRole,
  memberRoleDrafts,
  onModeChange,
  onSelectUser,
  onRoleChange,
  onMemberRoleChange,
  onSaveMemberRole,
  onAdd,
  onRemove,
  onRetry,
}: {
  projectRole: "owner" | "editor" | "viewer";
  accessMode: ProjectAccessMode;
  members: ProjectCollaborator[];
  eligibleMembers: CollaboratorData["eligibleMembers"];
  loading: boolean;
  error: string | null;
  pendingAction: PendingAction;
  selectedUserId: string;
  newRole: CollaboratorRole;
  memberRoleDrafts: Record<string, CollaboratorRole>;
  onModeChange: (mode: ProjectAccessMode) => void;
  onSelectUser: (userId: string) => void;
  onRoleChange: (role: CollaboratorRole) => void;
  onMemberRoleChange: (userId: string, role: CollaboratorRole) => void;
  onSaveMemberRole: (userId: string) => void;
  onAdd: () => void;
  onRemove: (userId: string) => void;
  onRetry: () => void;
}) {
  const canEditMembers = projectRole === "owner" || projectRole === "editor";
  const canChangeMode = projectRole === "owner";
  const busy = pendingAction !== null;

  return (
    <section
      aria-label="Project collaborators"
      className="mt-4 rounded-md border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Project access</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Team access remains the default. Selected access only includes the
            project creator, team owner, and listed collaborators.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>Access</span>
          <select
            aria-label="Project access mode"
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={accessMode}
            disabled={!canChangeMode || busy || loading || Boolean(error)}
            onChange={(event) =>
              onModeChange(event.target.value as ProjectAccessMode)
            }
          >
            <option value="team">Entire team</option>
            <option value="selected">Selected collaborators</option>
          </select>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={busy}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" /> Loading collaborators
        </p>
      ) : (
        <>
          {pendingAction && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {pendingAction === "mode"
                ? "Updating project access…"
                : pendingAction === "member"
                  ? "Adding collaborator…"
                  : pendingAction.startsWith("role:")
                    ? "Updating collaborator role…"
                    : "Removing collaborator…"}
            </p>
          )}
          {canEditMembers && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onAdd();
              }}
            >
              <label className="sr-only" htmlFor="project-collaborator-select">
                Add a team member
              </label>
              <select
                id="project-collaborator-select"
                className="h-9 min-w-48 flex-1 rounded-md border bg-background px-3 text-sm"
                value={selectedUserId}
                onChange={(event) => onSelectUser(event.target.value)}
                disabled={
                  busy || Boolean(error) || eligibleMembers.length === 0
                }
              >
                <option value="">Choose team member</option>
                {eligibleMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name || member.email || member.userId}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="project-collaborator-role">
                New collaborator role
              </label>
              <select
                id="project-collaborator-role"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={newRole}
                onChange={(event) =>
                  onRoleChange(event.target.value as CollaboratorRole)
                }
                disabled={busy || Boolean(error)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <Button
                type="submit"
                size="sm"
                disabled={busy || Boolean(error) || !selectedUserId}
              >
                {pendingAction === "member" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Add
              </Button>
            </form>
          )}

          {members.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No selected collaborators yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-md border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 p-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {member.name || member.email || member.userId}
                    </span>
                    {member.email && member.name && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {canEditMembers && (
                      <>
                        <label
                          className="sr-only"
                          htmlFor={`project-member-role-${member.userId}`}
                        >
                          Role for{" "}
                          {member.name || member.email || "collaborator"}
                        </label>
                        <select
                          id={`project-member-role-${member.userId}`}
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={memberRoleDrafts[member.userId] ?? member.role}
                          onChange={(event) =>
                            onMemberRoleChange(
                              member.userId,
                              event.target.value as CollaboratorRole,
                            )
                          }
                          disabled={busy || Boolean(error)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        {memberRoleDrafts[member.userId] &&
                          memberRoleDrafts[member.userId] !== member.role && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || Boolean(error)}
                              onClick={() => onSaveMemberRole(member.userId)}
                            >
                              {pendingAction === `role:${member.userId}` ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : null}
                              Save role
                            </Button>
                          )}
                      </>
                    )}
                    {!canEditMembers && (
                      <span className="text-xs capitalize text-muted-foreground">
                        {member.role}
                      </span>
                    )}
                    {canEditMembers && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${member.name || member.email || "collaborator"}`}
                        disabled={busy || Boolean(error)}
                        onClick={() => onRemove(member.userId)}
                      >
                        {pendingAction === `remove:${member.userId}` ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!canEditMembers && (
            <p className="mt-3 text-xs text-muted-foreground">
              You have view access. Ask a project editor or owner to change
              collaborators.
            </p>
          )}
          {canEditMembers && eligibleMembers.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              All current team members already have access, or there are no
              other team members to add.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ProjectCollaboratorsPanel({
  projectId,
  projectRole,
  accessMode: initialAccessMode,
  onProjectChanged,
}: {
  projectId: string;
  projectRole: "owner" | "editor" | "viewer";
  accessMode: ProjectAccessMode;
  onProjectChanged: () => void | Promise<unknown>;
}) {
  const [data, setData] = useState<CollaboratorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newRole, setNewRole] = useState<CollaboratorRole>("viewer");
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<
    Record<string, CollaboratorRole>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          await responseError(response, "Could not load collaborators"),
        );
      const result = (await response.json()) as CollaboratorData;
      setData(result);
      setSelectedUserId((current) =>
        result.eligibleMembers.some((member) => member.userId === current)
          ? current
          : "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load collaborators",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (
    action: Exclude<PendingAction, null>,
    run: () => Promise<Response>,
  ): Promise<boolean> => {
    setPendingAction(action);
    setError(null);
    try {
      const response = await run();
      if (!response.ok)
        throw new Error(
          await responseError(response, "Could not update project access"),
        );
      await load();
      await onProjectChanged();
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Could not update project access",
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const changeMode = (accessMode: ProjectAccessMode) => {
    if (
      accessMode === "selected" &&
      (data?.accessMode ?? initialAccessMode) !== "selected" &&
      !window.confirm(
        "Only the project creator, team owner, and listed collaborators will keep access. Continue?",
      )
    ) {
      return;
    }
    return mutate("mode", () =>
      fetch(`/api/projects/${projectId}/access-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessMode }),
      }),
    );
  };

  const add = () => {
    if (!selectedUserId) return;
    return mutate("member", () =>
      fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: newRole }),
      }),
    );
  };

  const saveMemberRole = async (userId: string) => {
    const role = memberRoleDrafts[userId];
    if (!role) return;
    const saved = await mutate(`role:${userId}`, () =>
      fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      }),
    );
    if (saved) {
      setMemberRoleDrafts((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  };

  const remove = (userId: string) =>
    mutate(`remove:${userId}`, () =>
      fetch(
        `/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      ),
    );

  return (
    <ProjectCollaboratorsPanelView
      projectRole={projectRole}
      accessMode={data?.accessMode ?? initialAccessMode}
      members={data?.members ?? []}
      eligibleMembers={data?.eligibleMembers ?? []}
      loading={loading}
      error={error}
      pendingAction={pendingAction}
      selectedUserId={selectedUserId}
      newRole={newRole}
      memberRoleDrafts={memberRoleDrafts}
      onModeChange={(mode) => void changeMode(mode)}
      onSelectUser={setSelectedUserId}
      onRoleChange={setNewRole}
      onMemberRoleChange={(userId, role) =>
        setMemberRoleDrafts((current) => ({ ...current, [userId]: role }))
      }
      onSaveMemberRole={(userId) => void saveMemberRole(userId)}
      onAdd={() => void add()}
      onRemove={(userId) => void remove(userId)}
      onRetry={() => void load()}
    />
  );
}
