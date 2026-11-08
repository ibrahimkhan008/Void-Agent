"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import React from "react";
import { Button } from "ui/button";

type ProposalResult = {
  status?: string;
  filename?: string;
  changes?: Array<{
    originalText?: string;
    suggestedText?: string;
    rationale?: string;
  }>;
  message?: string;
  error?: string;
};

export function ProjectDocumentEditProposal({
  result,
  loading,
}: {
  result: ProposalResult | null;
  loading: boolean;
}) {
  if (loading || !result)
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Preparing a tracked DOCX review copy…
      </div>
    );

  if (result.error)
    return (
      <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        {result.error}
      </div>
    );

  const changes = Array.isArray(result.changes) ? result.changes : [];
  if (result.status !== "pending_review" || changes.length === 0) return null;

  return (
    <section
      className="space-y-3 rounded-md border p-3"
      aria-label="Tracked document proposal awaiting review"
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">DOCX proposal awaiting review</p>
          <p className="truncate text-xs text-muted-foreground">
            {result.filename ?? "Project document"} · {changes.length} change
            {changes.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {changes.map((change, index) => (
          <li
            key={`${index}:${change.originalText ?? ""}`}
            className="space-y-1 text-xs"
          >
            <p className="text-destructive line-through">
              {change.originalText ?? ""}
            </p>
            <p className="text-emerald-700 dark:text-emerald-400">
              {change.suggestedText ?? ""}
            </p>
            {change.rationale && (
              <p className="text-muted-foreground">{change.rationale}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        No source changes were applied. Review the tracked copy in project
        documents and explicitly accept or reject it.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/projects">Open project documents</Link>
      </Button>
    </section>
  );
}
