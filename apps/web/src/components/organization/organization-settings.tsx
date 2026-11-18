"use client";

import { authClient } from "auth/client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type Org = { id: string; name: string; slug: string };
type Member = {
  id: string;
  userId: string;
  role: string;
  user: { name: string; email: string };
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | string;
};

export function OrganizationSettings({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const {
    data: orgResult,
    error: orgError,
    isLoading: orgLoading,
    mutate: refreshOrg,
  } = useSWR("active-organization", async () => {
    const result = await authClient.organization.getFullOrganization();
    if (result.error) throw new Error(result.error.message);
    return result.data as (Org & { members?: Member[] }) | null;
  });
  const org = orgResult ?? null;
  const orgId = org?.id;
  const {
    data: members = [],
    error: membersError,
    isLoading: membersLoading,
    mutate: refreshMembers,
  } = useSWR(orgId ? ["organization-members", orgId] : null, async () => {
    const result = await authClient.organization.listMembers({
      query: { organizationId: orgId! },
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data?.members ?? []) as Member[];
  });
  const canManage = members.some(
    (member) =>
      member.userId === userId && ["owner", "admin"].includes(member.role),
  );
  const {
    data: invitations = [],
    error: invitationsError,
    mutate: refreshInvitations,
  } = useSWR(
    orgId && canManage ? ["organization-invitations", orgId] : null,
    async () => {
      const result = await authClient.organization.listInvitations({
        query: { organizationId: orgId! },
      });
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as Invitation[];
    },
  );

  const refresh = useCallback(async () => {
    await Promise.all([refreshOrg(), refreshMembers(), refreshInvitations()]);
  }, [refreshInvitations, refreshMembers, refreshOrg]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!orgId || !email.trim()) return;
    setBusy(true);
    try {
      const result = await authClient.organization.inviteMember({
        email: email.trim().toLowerCase(),
        role,
        organizationId: orgId,
      });
      if (result.error) throw new Error(result.error.message);
      setEmail("");
      await refreshInvitations();
      toast.success("Invitation created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvitation(invitationId: string) {
    try {
      const result = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (result.error) throw new Error(result.error.message);
      toast.success("Invitation canceled.");
      await refreshInvitations();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel invitation.",
      );
    }
  }

  async function removeMember(memberId: string) {
    if (
      !orgId ||
      memberId === members.find((member) => member.userId === userId)?.id
    ) {
      toast.error("You cannot remove yourself from this organization here.");
      return;
    }
    if (!window.confirm("Remove this member from the organization?")) return;
    try {
      const result = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: orgId,
      });
      if (result.error) throw new Error(result.error.message);
      toast.success("Member removed.");
      await refreshMembers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove member.",
      );
    }
  }

  if (orgLoading)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Organization settings</h1>
        <p className="mt-4 text-muted-foreground">Loading your organization…</p>
      </main>
    );

  if (orgError || !org)
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="text-2xl font-semibold">Organization settings</h1>
        <p role="alert" className="text-muted-foreground">
          {orgError?.message ??
            "No active organization is available for this account."}
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 md:p-10">
      <header>
        <p className="text-sm text-muted-foreground">Workspace</p>
        <h1 className="text-3xl font-semibold">{org.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Manage members and invitations for this organization.
        </p>
      </header>
      {canManage && (
        <section className="rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Invite people</h2>
          <form onSubmit={invite} className="mt-4 flex flex-wrap gap-3">
            <input
              aria-label="Email address"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2"
            />
            <select
              aria-label="Organization role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "member" | "admin")
              }
              className="rounded-md border bg-background px-3 py-2"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            If email delivery is unavailable, copy the invite link from the
            pending invitations list. Each user can belong to one organization.
          </p>
        </section>
      )}
      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          <span className="text-sm text-muted-foreground">
            {members.length}
          </span>
        </div>
        {membersError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Could not load organization members: {membersError.message}
          </p>
        ) : membersLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading members…
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.user.email}
                  </p>
                </div>
                <span className="rounded border px-2 py-1 text-xs capitalize">
                  {member.role}
                </span>
                {canManage && member.userId !== userId && (
                  <button
                    onClick={() => void removeMember(member.id)}
                    className="text-sm text-destructive"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!membersError && !membersLoading && members.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No members found.
          </p>
        )}
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Invitations</h2>
        {!canManage ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Only organization owners and admins can view invitations.
          </p>
        ) : invitationsError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Could not load invitations: {invitationsError.message}
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {invitations
              .filter((item) => item.status === "pending")
              .map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.role} · expires{" "}
                      {new Date(item.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/accept-invitation/${item.id}`,
                        );
                        toast.success("Invitation link copied.");
                      } catch {
                        toast.error("Could not copy the invitation link.");
                      }
                    }}
                    className="text-sm text-muted-foreground underline"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() => void cancelInvitation(item.id)}
                    className="text-sm text-destructive"
                  >
                    Cancel
                  </button>
                </li>
              ))}
          </ul>
        )}
        {canManage &&
          !invitationsError &&
          invitations.filter((item) => item.status === "pending").length ===
            0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending invitations.
            </p>
          )}
      </section>
      <button
        onClick={() => void refresh()}
        className="text-sm text-muted-foreground underline"
      >
        Refresh organization data
      </button>
    </main>
  );
}
