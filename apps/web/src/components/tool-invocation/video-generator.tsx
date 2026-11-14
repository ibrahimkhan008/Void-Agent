"use client";

import { ToolUIPart } from "ai";
import { DownloadIcon } from "lucide-react";
import { memo, useMemo } from "react";
import { Button } from "ui/button";
import LetterGlitch from "ui/letter-glitch";
import { TextShimmer } from "ui/text-shimmer";

interface VideoGeneratorToolInvocationProps {
  part: ToolUIPart;
}

interface VideoGenerationResult {
  videoUrl?: string;
  mimeType?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
  model?: string;
  /** Set instead of videoUrl when the request failed. */
  error?: string;
}

function PureVideoGeneratorToolInvocation({
  part,
}: VideoGeneratorToolInvocationProps) {
  const isGenerating = useMemo(() => {
    return !part.state.startsWith("output");
  }, [part.state]);

  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as VideoGenerationResult;
  }, [part.state, part.output]);

  if (isGenerating || !result) {
    const phase = part.state.endsWith("input-available")
      ? "Generating your video — this takes about a minute…"
      : "Preparing video generation…";
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/90">
          <LetterGlitch />
        </div>
        <TextShimmer className="text-sm" duration={1.6}>
          {phase}
        </TextShimmer>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {result.error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <video
        controls
        className="aspect-video w-full overflow-hidden rounded-xl bg-black"
        src={result.videoUrl}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {result.model}
          {result.durationSeconds ? ` · ${result.durationSeconds}s` : ""}
          {result.aspectRatio ? ` · ${result.aspectRatio}` : ""}
        </p>
        {result.videoUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={result.videoUrl} download>
              <DownloadIcon className="mr-1.5 size-3.5" />
              Download MP4
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export const VideoGeneratorToolInvocation = memo(
  PureVideoGeneratorToolInvocation,
);
