"use client";

import type { MorphikImagePreview } from "lib/ai/mcp/morphik-media";
import React, { useEffect, useState } from "react";

export function MorphikImagePreviewCard({
  preview,
}: { preview: MorphikImagePreview }) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | undefined;
    let active = true;
    void fetch("/api/mcp/media/morphik-image", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        preview.previewRef ? { ref: preview.previewRef } : { url: preview.url },
      ),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image preview unavailable");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Invalid image");
        return URL.createObjectURL(blob);
      })
      .then((url) => {
        objectUrl = url;
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview.previewRef, preview.url]);

  return (
    <figure className="max-w-xs space-y-1 rounded-md border p-2">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={preview.title}
          loading="lazy"
          className="max-h-72 max-w-full rounded object-contain"
        />
      ) : (
        <div
          className="flex min-h-24 items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          {failed ? "Image preview unavailable" : "Loading image preview…"}
        </div>
      )}
      <figcaption className="break-words text-sm">{preview.title}</figcaption>
      {preview.score !== undefined && (
        <p className="text-xs text-muted-foreground">
          Relevance: {preview.score.toFixed(2)}
        </p>
      )}
      {preview.docUrl && (
        <a
          href={preview.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline"
        >
          Open source document
        </a>
      )}
    </figure>
  );
}
