import React from "react";

type ProjectBrainClaimEvidenceProps = {
  label: string;
  evidence: string;
  filename?: string | null;
  sourceUrl?: string | null;
  factCapturedAt?: string | Date | null;
};

export function ProjectBrainClaimEvidence({
  label,
  evidence,
  filename,
  sourceUrl,
  factCapturedAt,
}: ProjectBrainClaimEvidenceProps) {
  const source = filename || sourceUrl || "Source document";
  const capturedAt = factCapturedAt ? new Date(factCapturedAt) : undefined;

  return (
    <div className="rounded border p-2">
      <p className="font-medium text-foreground">
        {label}: {source}
      </p>
      {capturedAt && !Number.isNaN(capturedAt.getTime()) && (
        <p className="mt-1">
          Fact captured{" "}
          <time dateTime={capturedAt.toISOString()}>
            {capturedAt.toLocaleString()}
          </time>
        </p>
      )}
      <p className="mt-1">{evidence}</p>
    </div>
  );
}
