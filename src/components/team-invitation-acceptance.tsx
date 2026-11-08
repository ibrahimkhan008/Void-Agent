"use client";

import { authClient } from "auth/client";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";

const PENDING_INVITATION_KEY = "void-agent:pending-team-invitation";

export function TeamInvitationAcceptance() {
  const { data: session, isPending } = authClient.useSession();
  const [state, setState] = useState<"loading" | "accepted" | "error">(
    "loading",
  );
  const [hasToken, setHasToken] = useState(false);
  const [message, setMessage] = useState("Checking your invitation...");

  useEffect(() => {
    if (isPending) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = fragment.get("token");
    if (fragmentToken) {
      window.sessionStorage.setItem(PENDING_INVITATION_KEY, fragmentToken);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = window.sessionStorage.getItem(PENDING_INVITATION_KEY);
    setHasToken(Boolean(token));
    if (!token) {
      setState("error");
      setMessage("This invitation link is invalid or has already been used.");
      return;
    }
    if (!session?.user?.id) {
      const callbackUrl = encodeURIComponent("/team-invitations/accept");
      window.location.assign(`/sign-in?callbackUrl=${callbackUrl}`);
      return;
    }
    let cancelled = false;
    void fetch("/api/team-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(body.error ?? "Could not accept invitation.");
        window.sessionStorage.removeItem(PENDING_INVITATION_KEY);
        if (!cancelled) {
          setState("accepted");
          setMessage("You joined the team. Your team access is ready.");
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState("error");
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Could not accept invitation.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, session?.user?.id]);

  const switchAccount = async () => {
    await authClient.signOut();
    window.location.assign(
      `/sign-in?callbackUrl=${encodeURIComponent("/team-invitations/accept")}`,
    );
  };

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center p-6">
      <section className="w-full space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Team invitation</h1>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          {state === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state === "accepted" ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 text-destructive" />
          )}
          {message}
        </p>
        {state === "accepted" && (
          <a
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            href="/projects"
          >
            Open projects
          </a>
        )}
        {state === "error" && (
          <div className="flex flex-wrap gap-4">
            {hasToken && (
              <button
                type="button"
                onClick={() => void switchAccount()}
                className="text-sm underline"
              >
                Sign in with the invited account
              </button>
            )}
            <a className="text-sm underline" href="/team-members">
              Open team settings
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
