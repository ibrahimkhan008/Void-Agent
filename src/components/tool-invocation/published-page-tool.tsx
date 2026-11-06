"use client";

import type { ToolUIPart } from "ai";
import { isValidPageSlug } from "lib/published-page/slug-validation";
import { toAny } from "lib/utils";
import { ExternalLink, Globe2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "ui/badge";
import { Button } from "ui/button";

export function PublishedPageToolCard({ part }: { part: ToolUIPart }) {
  const output = toAny(part.output) as {
    slug?: string;
    version?: number;
    message?: string;
    error?: string;
  } | null;
  const slug = isValidPageSlug(output?.slug ?? "") ? output!.slug : undefined;
  const error = part.state === "output-error" ? part.errorText : output?.error;
  const pending = !part.state.startsWith("output");

  return (
    <div className="mx-6 my-3 flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Globe2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Public page</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {error ||
            output?.message ||
            (pending ? "Publishing page…" : "Page published")}
        </div>
      </div>
      {error ? (
        <Badge variant="destructive">Failed</Badge>
      ) : pending ? (
        <Badge variant="secondary">Publishing</Badge>
      ) : slug ? (
        <>
          <Badge variant="outline">v{output?.version ?? 1}</Badge>
          <Button asChild size="sm">
            <Link href={`/p/${slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-3" />
              Open page
            </Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}
