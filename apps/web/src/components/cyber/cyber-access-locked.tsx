"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCw, ShieldOff, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type CyberLockReason = "none" | "inactive" | "unavailable";

interface CyberAccessLockedProps {
  reason: CyberLockReason;
  email?: string | null;
  status?: string | null;
  platformRole?: string | null;
}

export function CyberAccessLocked({
  reason,
  email,
  status,
  platformRole,
}: CyberAccessLockedProps) {
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  const unavailable = reason === "unavailable";
  const Icon = unavailable ? WifiOff : ShieldOff;

  const title = unavailable
    ? "Void Cyber is unavailable right now"
    : reason === "inactive"
      ? `Your Void Cyber access is ${status ?? "paused"}`
      : "You don't have Void Cyber access yet";

  const body = unavailable
    ? "We couldn't check your access. This is usually temporary, so try again in a moment."
    : reason === "inactive"
      ? "A Tier 3 administrator paused your researcher profile. Ask them to review it in User Governance."
      : "Void Cyber is limited to approved security researchers. A Tier 3 administrator can grant access from User Governance.";

  return (
    <div className="flex h-full min-h-[70vh] w-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-border bg-muted/60">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground text-pretty">
        {body}
      </p>

      {platformRole && reason === "none" ? (
        <p className="mt-3 max-w-md text-xs text-muted-foreground text-pretty">
          You are signed in with the{" "}
          <span className="font-medium text-foreground">{platformRole}</span>{" "}
          role. Only platform admins get access automatically. If this is your
          workspace, give your account the admin role or add your email to{" "}
          <code className="font-mono">VOID_CYBER_ADMIN_EMAILS</code>.
        </p>
      ) : null}

      {!unavailable && (
        <ol className="mt-6 w-full max-w-sm space-y-2 rounded-xl border border-border bg-card/60 p-4 text-left text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="tabular-nums text-foreground">1</span>
            <span className="min-w-0">
              Send your account email to a Tier 3 administrator
              {email ? (
                <>
                  :
                  <span className="block break-words font-medium text-foreground">
                    {email}
                  </span>
                </>
              ) : null}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular-nums text-foreground">2</span>
            <span>Ask for a Researcher or Auditor tier</span>
          </li>
          <li className="flex gap-3">
            <span className="tabular-nums text-foreground">3</span>
            <span>Come back and check again once you're approved</span>
          </li>
        </ol>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">
            <ArrowLeft aria-hidden="true" />
            Back to chat
          </Link>
        </Button>
        <Button
          variant="outline"
          disabled={checking}
          onClick={() => startChecking(() => router.refresh())}
        >
          <RotateCw
            aria-hidden="true"
            className={checking ? "animate-spin" : undefined}
          />
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
    </div>
  );
}
