"use client";

import { authClient } from "auth/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function AcceptOrganizationInvitation({
  invitationId,
}: { invitationId: string }) {
  const [invitation, setInvitation] = useState<{
    organizationName?: string;
    email?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void authClient.organization
      .getInvitation({ query: { id: invitationId } })
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data)
          setError(result.error?.message ?? "This invitation is unavailable.");
        else
          setInvitation(
            result.data as { organizationName?: string; email?: string },
          );
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Could not load this invitation.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [invitationId]);

  async function respond(accept: boolean) {
    setBusy(true);
    const result = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId });
    if (result.error) {
      const message =
        result.error.message ?? "Could not process this invitation.";
      setError(message);
      toast.error(message);
      setBusy(false);
      return;
    }
    if (accept) {
      const orgId = (
        result.data as { member?: { organizationId?: string } } | null
      )?.member?.organizationId;
      if (orgId)
        await authClient.organization.setActive({ organizationId: orgId });
      window.location.assign("/");
    } else {
      setError("Invitation declined.");
      setBusy(false);
    }
  }

  return (
    <main className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm">
      <p className="text-sm text-muted-foreground">Organization invitation</p>
      <h1 className="mt-2 text-2xl font-semibold">
        Join {invitation?.organizationName ?? "an organization"}
      </h1>
      {loading ? (
        <p className="mt-5 text-muted-foreground">Loading invitation…</p>
      ) : error ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            This invitation is for {invitation?.email}. Accepting it will add
            you to the organization and switch your active workspace.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              disabled={busy}
              onClick={() => void respond(true)}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Working…" : "Accept invitation"}
            </button>
            <button
              disabled={busy}
              onClick={() => void respond(false)}
              className="rounded-md border px-4 py-2 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </>
      )}
    </main>
  );
}
