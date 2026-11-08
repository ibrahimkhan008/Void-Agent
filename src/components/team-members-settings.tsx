"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Loader2,
  MailPlus,
  UserPlus,
  X,
} from "lucide-react";
import React, { type FormEvent, useCallback, useEffect, useState } from "react";

type Team = { id: string; name: string; role: string; canManage: boolean };
type TeamInvitation = {
  id: string;
  email: string;
  role: "member" | "viewer";
  status: string;
  expiresAt: string;
};

const privateFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });

const describeDeliveryStatus = (status: unknown) => {
  if (status === "sent") return "Invitation email sent.";
  if (status === "disabled")
    return "Email delivery is disabled. Copy the invitation link and share it directly.";
  if (status === "failed")
    return "The invitation was created, but email delivery failed. Copy the link and share it directly.";
  return "The invitation was created. Copy the link and share it directly.";
};

export function TeamMembersSettings() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState("");
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [invitationError, setInvitationError] = useState("");
  const [invitationSuccess, setInvitationSuccess] = useState("");
  const [acceptUrl, setAcceptUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selectedTeam = teams.find((team) => team.id === teamId);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await privateFetch("/api/projects/teams");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load teams.");
      const nextTeams = (body.teams ?? []) as Team[];
      setTeams(nextTeams);
      setTeamId((current) => current || nextTeams[0]?.id || "");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load teams.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const loadInvitations = useCallback(async (forTeamId: string) => {
    if (!forTeamId) {
      setInvitations([]);
      return;
    }
    setLoadingInvitations(true);
    setInvitationError("");
    try {
      const response = await privateFetch(
        `/api/teams/${encodeURIComponent(forTeamId)}/invitations`,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load invitations.");
      setInvitations(
        Array.isArray(body.invitations)
          ? (body.invitations as TeamInvitation[])
          : [],
      );
    } catch (cause) {
      setInvitationError(
        cause instanceof Error ? cause.message : "Could not load invitations.",
      );
      setInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => {
    setAcceptUrl("");
    setCopyStatus("");
    setInvitationSuccess("");
    if (selectedTeam?.canManage && teamId) {
      void loadInvitations(teamId);
    } else {
      setInvitations([]);
      setInvitationError("");
    }
  }, [loadInvitations, selectedTeam?.canManage, teamId]);

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teamId || adding) return;
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const response = await privateFetch(
        `/api/teams/${encodeURIComponent(teamId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not add team member.");
      setEmail("");
      setSuccess(`${email.trim()} was added to the team as ${role}.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add team member.",
      );
    } finally {
      setAdding(false);
    }
  };

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teamId || creatingInvitation) return;
    setCreatingInvitation(true);
    setInvitationError("");
    setInvitationSuccess("");
    setAcceptUrl("");
    setCopyStatus("");
    try {
      const response = await privateFetch(
        `/api/teams/${encodeURIComponent(teamId)}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not create invitation.");
      setInviteEmail("");
      setAcceptUrl(typeof body.acceptUrl === "string" ? body.acceptUrl : "");
      setInvitationSuccess(describeDeliveryStatus(body.deliveryStatus));
      await loadInvitations(teamId);
    } catch (cause) {
      setInvitationError(
        cause instanceof Error ? cause.message : "Could not create invitation.",
      );
    } finally {
      setCreatingInvitation(false);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!teamId || revokingInvitationId) return;
    setRevokingInvitationId(invitationId);
    setInvitationError("");
    setInvitationSuccess("");
    try {
      const response = await privateFetch(
        `/api/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not revoke invitation.");
      setInvitationSuccess("Invitation revoked.");
      await loadInvitations(teamId);
    } catch (cause) {
      setInvitationError(
        cause instanceof Error ? cause.message : "Could not revoke invitation.",
      );
    } finally {
      setRevokingInvitationId("");
    }
  };

  const copyInvitationLink = async () => {
    if (!acceptUrl) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      setCopyStatus("Invitation link copied.");
    } catch {
      setCopyStatus("Copy failed. Select and copy the invitation link above.");
    }
  };

  return (
    <main
      className="mx-auto w-full max-w-4xl space-y-6 p-5 md:p-8"
      data-testid="team-members-settings"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Team members</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Add an existing Void-Agent account to a team. Only team owners and
          admins can manage membership.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm"
        >
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-600/30 p-3 text-sm"
        >
          <CheckCircle2 className="size-4" />
          {success}
        </p>
      )}

      {loading ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Loading teams...
        </p>
      ) : teams.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          You do not belong to a team.
        </p>
      ) : (
        <>
          <label className="block max-w-xl space-y-2 text-sm font-medium">
            <span>Team</span>
            <select
              aria-label="Team"
              className="h-10 w-full rounded-md border bg-background px-3"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={
                adding || creatingInvitation || Boolean(revokingInvitationId)
              }
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTeam?.canManage ? (
            <form
              className="max-w-xl space-y-4 rounded-xl border bg-card p-5"
              onSubmit={(event) => void addMember(event)}
            >
              <label className="block space-y-2 text-sm font-medium">
                <span>Existing account email</span>
                <input
                  aria-label="Existing account email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={adding}
                  className="h-10 w-full rounded-md border bg-background px-3"
                  placeholder="teammate@example.com"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Role</span>
                <select
                  aria-label="Role"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as "member" | "viewer")
                  }
                  disabled={adding}
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Add a registered account immediately. To invite someone who does
                not have access yet, use the invitation form below.
              </p>
              <button
                type="submit"
                disabled={!teamId || !email.trim() || adding}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Add member
              </button>
            </form>
          ) : (
            <p
              className="max-w-xl rounded-md border p-4 text-sm text-muted-foreground"
              role="status"
            >
              Only this team&apos;s owner and admins can add members.
            </p>
          )}

          {selectedTeam?.canManage && (
            <section
              className="max-w-xl space-y-4 rounded-xl border bg-card p-5"
              aria-labelledby="team-invitations-heading"
            >
              <div className="space-y-1">
                <h2
                  id="team-invitations-heading"
                  className="text-lg font-semibold"
                >
                  Invite someone
                </h2>
                <p className="text-sm text-muted-foreground">
                  They must sign in with the invited email address before they
                  can accept and join this team.
                </p>
              </div>

              {invitationError && (
                <p role="alert" className="text-sm text-destructive">
                  {invitationError}
                </p>
              )}
              {invitationSuccess && (
                <p role="status" className="text-sm">
                  {invitationSuccess}
                </p>
              )}
              {acceptUrl && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="block space-y-2 text-sm font-medium">
                    <span>Invitation link</span>
                    <input
                      aria-label="Invitation link"
                      readOnly
                      value={acceptUrl}
                      onFocus={(event) => event.currentTarget.select()}
                      className="h-10 w-full rounded-md border bg-background px-3 font-normal"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void copyInvitationLink()}
                    className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
                  >
                    <Clipboard className="size-4" />
                    Copy invitation link
                  </button>
                  {copyStatus && (
                    <p role="status" className="text-xs text-muted-foreground">
                      {copyStatus}
                    </p>
                  )}
                </div>
              )}

              <form
                className="space-y-4"
                onSubmit={(event) => void createInvitation(event)}
              >
                <label className="block space-y-2 text-sm font-medium">
                  <span>Email address</span>
                  <input
                    aria-label="Invite email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    disabled={creatingInvitation}
                    className="h-10 w-full rounded-md border bg-background px-3"
                    placeholder="teammate@example.com"
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  <span>Invitation role</span>
                  <select
                    aria-label="Invitation role"
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as "member" | "viewer")
                    }
                    disabled={creatingInvitation}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={
                    !teamId || !inviteEmail.trim() || creatingInvitation
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creatingInvitation ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MailPlus className="size-4" />
                  )}
                  Send invitation
                </button>
              </form>

              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Pending invitations</h3>
                {loadingInvitations ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading invitations...
                  </p>
                ) : invitations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No pending invitations.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {invitations.map((invitation) => (
                      <li
                        key={invitation.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <p className="break-all text-sm font-medium">
                            {invitation.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {invitation.role} · expires{" "}
                            {Number.isNaN(Date.parse(invitation.expiresAt))
                              ? "at an unknown time"
                              : new Date(invitation.expiresAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Revoke invitation for ${invitation.email}`}
                          onClick={() => void revokeInvitation(invitation.id)}
                          disabled={Boolean(revokingInvitationId)}
                          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
                        >
                          {revokingInvitationId === invitation.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <X className="size-4" />
                          )}
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
