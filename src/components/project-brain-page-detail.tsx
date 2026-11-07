import React from "react";
import { Button } from "ui/button";

export type ProjectBrainPageDetail = {
  page: {
    id: string;
    title: string;
    entityType: string;
    normalizedTitle: string;
    salience: number;
    updatedAt: string;
  };
  aliases: string[];
  mergedFrom: Array<{ title: string; mergedAt: string }>;
  links: Array<{
    pageId: string;
    title: string;
    type: string;
    confidence: number;
  }>;
  backlinks: Array<{
    pageId: string;
    title: string;
    type: string;
    confidence: number;
  }>;
  facts: Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
    evidence: string;
    confidence: number;
    reviewStatus: "proposed" | "accepted" | "rejected";
    sourceVersionId: string;
    sourceVersionCreatedAt: string;
    sourceSnapshotAvailable: boolean;
    filename: string | null;
    sourceUrl: string | null;
  }>;
};

export function ProjectBrainPageDetailPanel({
  detail,
  loading,
  error,
  canReview,
  revisionPreview,
  loadingRevisionId,
  onToggleRevision,
  onReviewFact,
}: {
  detail: ProjectBrainPageDetail | null | undefined;
  loading: boolean;
  error: boolean;
  canReview: boolean;
  revisionPreview: { id: string; content: string } | null;
  loadingRevisionId: string | null;
  onToggleRevision: (versionId: string) => void;
  onReviewFact: (factId: string, status: "accepted" | "rejected") => void;
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading current entity evidence…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load this entity&apos;s source-backed details.
      </p>
    );
  }
  if (!detail) {
    return (
      <p className="text-sm text-muted-foreground">
        This identity is no longer backed by an accepted claim in the current
        source scope.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h5 className="font-medium">
          {detail.page.title}
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {detail.page.entityType}
          </span>
        </h5>
        <p className="text-xs text-muted-foreground">
          Current source revisions only · {detail.facts.length} claims
        </p>
        {detail.aliases.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Accepted aliases: {detail.aliases.join(", ")}
          </p>
        )}
        {detail.mergedFrom.length > 0 && (
          <section className="mt-2" aria-label="Merge history">
            <h6 className="text-xs font-medium text-muted-foreground">
              Merged identities
            </h6>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {detail.mergedFrom.map((merge, index) => (
                <li key={`${merge.title}:${merge.mergedAt}:${index}`}>
                  {merge.title} · {new Date(merge.mergedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {(detail.links.length > 0 || detail.backlinks.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Links", detail.links],
            ["Backlinks", detail.backlinks],
          ].map(([label, entries]) => {
            const relationships = entries as ProjectBrainPageDetail["links"];
            return (
              <section key={label as string} className="rounded-md border p-3">
                <h6 className="mb-2 text-xs font-medium text-muted-foreground">
                  {label as string}
                </h6>
                <ul className="space-y-1 text-sm">
                  {relationships.map((relationship) => (
                    <li key={`${relationship.pageId}:${relationship.type}`}>
                      <span className="font-medium">{relationship.title}</span>
                      <span className="text-muted-foreground">
                        {` · ${relationship.type}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {detail.facts.length ? (
        <ul className="space-y-2">
          {detail.facts.map((fact) => (
            <li key={fact.id} className="rounded-md bg-muted/30 p-3 text-sm">
              <p>
                <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
                  {fact.reviewStatus}
                </span>
                <strong>{fact.subject}</strong> {fact.predicate}: {fact.object}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fact.evidence}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {fact.filename ?? "Project source"} · revision{" "}
                  {new Date(fact.sourceVersionCreatedAt).toLocaleString()}
                </span>
                {fact.sourceSnapshotAvailable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingRevisionId === fact.sourceVersionId}
                    onClick={() => onToggleRevision(fact.sourceVersionId)}
                  >
                    {loadingRevisionId === fact.sourceVersionId
                      ? "Loading revision…"
                      : revisionPreview?.id === fact.sourceVersionId
                        ? "Hide revision"
                        : "View exact source revision"}
                  </Button>
                ) : (
                  <span>Revision snapshot unavailable</span>
                )}
              </div>
              {canReview && fact.reviewStatus === "proposed" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onReviewFact(fact.id, "accepted")}
                  >
                    Accept claim
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReviewFact(fact.id, "rejected")}
                  >
                    Reject claim
                  </Button>
                </div>
              )}
              {revisionPreview?.id === fact.sourceVersionId && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
                  {revisionPreview.content}
                </pre>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No claims from currently visible source revisions are attached to this
          entity.
        </p>
      )}
    </div>
  );
}
