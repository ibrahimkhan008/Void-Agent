"use client";

import { analytics } from "@/lib/analytics/posthog";
import { fetcher } from "lib/utils";
import { GitFork, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

/**
 * Gallery fork action: copies a published agent into the signed-in viewer's
 * account and lands them on their editable copy. Signed-out visitors get the
 * sign-in link — the gallery itself is public, the fork is not.
 */
export function GalleryForkButton({
  agentId,
  agentName,
  isSignedIn,
}: {
  agentId: string;
  agentName: string;
  isSignedIn: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isForking, setIsForking] = useState(false);

  if (!isSignedIn) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        data-testid="gallery-sign-in-to-fork"
      >
        <Link href="/sign-in">{t("Agent.signInToFork")}</Link>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isForking}
      onClick={async () => {
        setIsForking(true);
        try {
          const result = await fetcher(`/api/agent/${agentId}/fork`, {
            method: "POST",
          });
          analytics.agentForked({
            agentId,
            forkId: result.agent.id,
            name: result.agent.name,
          });
          toast.success(t("Agent.forkedToast", { name: result.agent.name }));
          router.push(`/agent/${result.agent.id}`);
        } catch (error) {
          console.error("Failed to fork agent:", error);
          toast.error(t("Agent.forkFailedToast"));
        } finally {
          setIsForking(false);
        }
      }}
      data-testid="gallery-fork-button"
    >
      {isForking ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <GitFork className="size-3.5" />
      )}
      {t("Agent.fork")}
      <span className="sr-only">{agentName}</span>
    </Button>
  );
}
