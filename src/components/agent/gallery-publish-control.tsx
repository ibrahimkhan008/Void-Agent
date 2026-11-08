"use client";

import { Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "ui/button";

type PublicationStatus = {
  publishedAt: string | null;
  visibility: "private" | "public" | "readonly";
};

export function GalleryPublishControl({
  agentId,
  visibility,
  canPublish,
}: {
  agentId: string;
  visibility: PublicationStatus["visibility"];
  canPublish: boolean;
}) {
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/agent/${agentId}/publish`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load gallery status");
        return (await response.json()) as PublicationStatus;
      })
      .then((status) => {
        if (active) setPublishedAt(status.publishedAt);
      })
      .catch(() => {
        if (active) setError("Could not load gallery status");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  const updatePublication = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/${agentId}/publish`, {
        method: publishedAt ? "DELETE" : "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        publishedAt?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Could not update gallery publication");
        return;
      }
      setPublishedAt(body.publishedAt ?? null);
    } catch {
      setError("Could not update gallery publication");
    } finally {
      setSaving(false);
    }
  };

  if (!canPublish) return null;

  const canShare = visibility === "public" || visibility === "readonly";
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={updatePublication}
        disabled={loading || saving || (!publishedAt && !canShare)}
        data-testid="agent-gallery-publish-toggle"
      >
        {loading || saving ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Globe className="mr-2 size-4" />
        )}
        {publishedAt ? "Remove from gallery" : "Publish to gallery"}
      </Button>
      {!canShare && !publishedAt ? (
        <p className="max-w-56 text-right text-xs text-muted-foreground">
          Set visibility to public or readonly before publishing.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="max-w-56 text-right text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
