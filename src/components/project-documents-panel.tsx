"use client";

import { useCollections } from "@/hooks/queries/use-collections";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Textarea } from "ui/textarea";

type ProjectDocument = {
  id: string;
  collectionId: string;
  filename: string | null;
  mediaType: string | null;
  status: string;
  createdAt: string;
};
type AnalysisResult = {
  answer: string;
  filename: string;
  citations: { source: string; quote: string }[];
};
type TrackedProposal = {
  originalText: string;
  suggestedText: string;
  rationale: string;
};
type TrackedEdit = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "stale";
  canResolve: boolean;
  changes: TrackedProposal[];
  createdAt: string;
};

export function ProjectDocumentsPanel({
  projectId,
  collectionIds,
  canEdit,
}: {
  projectId: string;
  collectionIds: string[];
  canEdit: boolean;
}) {
  const { data: collectionData } = useCollections();
  const [collectionId, setCollectionId] = useState("");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [writableCollectionIds, setWritableCollectionIds] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [activeAnalysisItemId, setActiveAnalysisItemId] = useState<
    string | null
  >(null);
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTrackedItemId, setActiveTrackedItemId] = useState<string | null>(
    null,
  );
  const [trackedInstructions, setTrackedInstructions] = useState<
    Record<string, string>
  >({});
  const [trackedEdits, setTrackedEdits] = useState<
    Record<string, TrackedEdit[]>
  >({});
  const [trackedErrors, setTrackedErrors] = useState<Record<string, string>>(
    {},
  );
  const [trackedBusy, setTrackedBusy] = useState<string | null>(null);
  const analysisRequestId = useRef(0);
  const availableCollections = useMemo(
    () =>
      (collectionData?.collections ?? []).filter(
        (collection) =>
          collectionIds.includes(collection.id) &&
          writableCollectionIds.includes(collection.id),
      ),
    [collectionData?.collections, collectionIds, writableCollectionIds],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load project documents");
      const result = (await response.json()) as {
        documents: ProjectDocument[];
        writableCollectionIds?: string[];
      };
      setDocuments(result.documents);
      setWritableCollectionIds(result.writableCollectionIds ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (file?: File) => {
    if (!file) return;
    if (!collectionId)
      return toast.error("Choose an attached knowledge collection");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("collectionId", collectionId);
      form.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      toast.success("Document added to project");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const ask = async (itemId: string) => {
    if (!question.trim()) return toast.error("Enter a question");
    const requestId = ++analysisRequestId.current;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${itemId}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as
        | AnalysisResult
        | { error?: string };
      if (!response.ok || !("answer" in result)) {
        throw new Error("error" in result ? result.error : "Analysis failed");
      }
      if (analysisRequestId.current === requestId) setAnalysis(result);
    } catch (error) {
      if (analysisRequestId.current === requestId)
        toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      if (analysisRequestId.current === requestId) setAnalyzing(false);
    }
  };

  const loadTrackedEdits = async (itemId: string) => {
    setTrackedBusy(itemId);
    setTrackedErrors((current) => ({ ...current, [itemId]: "" }));
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${itemId}/edits`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        edits?: TrackedEdit[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(result.edits))
        throw new Error(result.error ?? "Could not load tracked edits.");
      setTrackedEdits((current) => ({ ...current, [itemId]: result.edits! }));
    } catch (error) {
      setTrackedErrors((current) => ({
        ...current,
        [itemId]:
          error instanceof Error
            ? error.message
            : "Could not load tracked edits.",
      }));
    } finally {
      setTrackedBusy((current) => (current === itemId ? null : current));
    }
  };

  const proposeTrackedEdits = async (document: ProjectDocument) => {
    const instruction = trackedInstructions[document.id]?.trim();
    if (!instruction)
      return toast.error("Describe the document changes you want");
    setTrackedBusy(document.id);
    setTrackedErrors((current) => ({ ...current, [document.id]: "" }));
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${document.id}/edits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "propose", instruction }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        edit?: TrackedEdit;
        error?: string;
      };
      if (!response.ok || !result.edit)
        throw new Error(result.error ?? "Could not generate tracked edits.");
      setTrackedEdits((current) => ({
        ...current,
        [document.id]: [result.edit!, ...(current[document.id] ?? [])],
      }));
      setTrackedInstructions((current) => ({ ...current, [document.id]: "" }));
      toast.success("Tracked changes are ready for review");
    } catch (error) {
      setTrackedErrors((current) => ({
        ...current,
        [document.id]:
          error instanceof Error
            ? error.message
            : "Could not generate tracked edits.",
      }));
    } finally {
      setTrackedBusy((current) => (current === document.id ? null : current));
    }
  };

  const resolveTrackedEdit = async (
    documentId: string,
    editId: string,
    decision: "accepted" | "rejected",
  ) => {
    setTrackedBusy(editId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${documentId}/edits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", editId, decision }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (!response.ok || result.status !== decision)
        throw new Error(result.error ?? "Could not resolve tracked edits.");
      await loadTrackedEdits(documentId);
      toast.success(
        decision === "accepted" ? "Changes accepted" : "Changes rejected",
      );
    } catch (error) {
      setTrackedErrors((current) => ({
        ...current,
        [documentId]:
          error instanceof Error
            ? error.message
            : "Could not resolve tracked edits.",
      }));
    } finally {
      setTrackedBusy((current) =>
        current === editId || current === documentId ? null : current,
      );
    }
  };

  const removeFromProject = async (itemId: string) => {
    setRemovingItemId(itemId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${itemId}`,
        { method: "DELETE" },
      );
      if (!response.ok)
        throw new Error("Could not remove document from project");
      if (activeAnalysisItemId === itemId) {
        analysisRequestId.current += 1;
        setActiveAnalysisItemId(null);
        setAnalysis(null);
      }
      toast.success("Document removed from project");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove document from project",
      );
    } finally {
      setRemovingItemId(null);
    }
  };

  return (
    <section
      className="mt-4 rounded-md border p-3"
      aria-label="Project documents"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Project documents</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Knowledge collection for document"
              className="h-8 max-w-56 rounded-md border bg-background px-2 text-xs"
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              disabled={uploading || availableCollections.length === 0}
            >
              <option value="">Choose collection</option>
              {availableCollections.map((collection) => (
                <option value={collection.id} key={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer">
              <input
                className="sr-only"
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.tsv,.yaml,.yml,.log"
                disabled={
                  uploading || !collectionId || !availableCollections.length
                }
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void upload(file);
                }}
              />
              <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground">
                {uploading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Upload className="size-3" />
                )}
                Add file
              </span>
            </label>
          </div>
        )}
      </div>
      {canEdit && availableCollections.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Attach a writable knowledge collection to this project before adding
          files. Collections shared with you as read-only cannot accept project
          documents.
        </p>
      )}
      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading documents…</p>
      ) : loadError ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
          <span>Could not load project documents.</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No project documents yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map((document) => (
            <li key={document.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {document.filename ?? "Document"}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      analysisRequestId.current += 1;
                      setAnalyzing(false);
                      setActiveAnalysisItemId(
                        activeAnalysisItemId === document.id
                          ? null
                          : document.id,
                      );
                      setQuestion("");
                      setAnalysis(null);
                    }}
                    aria-expanded={activeAnalysisItemId === document.id}
                    aria-controls={`project-document-analysis-${document.id}`}
                  >
                    Ask
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const opening = activeTrackedItemId !== document.id;
                      setActiveTrackedItemId(opening ? document.id : null);
                      if (opening) void loadTrackedEdits(document.id);
                    }}
                    aria-expanded={activeTrackedItemId === document.id}
                    aria-controls={`project-document-edits-${document.id}`}
                    disabled={
                      document.status !== "ready" ||
                      !document.filename?.toLowerCase().endsWith(".docx")
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    disabled={document.status !== "ready"}
                  >
                    <a
                      href={`/api/projects/${projectId}/documents/${document.id}/download`}
                    >
                      <Download className="mr-1 size-3" /> Download
                    </a>
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${document.filename ?? "document"} from project`}
                      onClick={() => void removeFromProject(document.id)}
                      disabled={removingItemId === document.id}
                    >
                      {removingItemId === document.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {document.status !== "ready" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Document status: {document.status}
                </p>
              )}
              {activeAnalysisItemId === document.id && (
                <div
                  id={`project-document-analysis-${document.id}`}
                  className="mt-3 space-y-2 border-t pt-3"
                >
                  <Textarea
                    aria-label={`Question about ${document.filename ?? "document"}`}
                    maxLength={2000}
                    placeholder="Ask a question about this document"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => void ask(document.id)}
                    disabled={analyzing || document.status !== "ready"}
                  >
                    {analyzing ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : null}
                    Ask document
                  </Button>
                  {analysis && (
                    <div className="space-y-2 rounded-md bg-muted/50 p-3">
                      <p className="whitespace-pre-wrap">{analysis.answer}</p>
                      {analysis.citations.length > 0 && (
                        <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                          {analysis.citations.map((citation, index) => (
                            <li key={`${index}:${citation.quote}`}>
                              {citation.source}: “{citation.quote}”
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
              {activeTrackedItemId === document.id && (
                <div
                  id={`project-document-edits-${document.id}`}
                  className="mt-3 space-y-3 border-t pt-3"
                >
                  <p className="text-xs text-muted-foreground">
                    Describe the changes you want. The original stays unchanged;
                    generated Word tracked changes require your review.
                  </p>
                  <Textarea
                    aria-label={`Edit instructions for ${document.filename ?? "document"}`}
                    maxLength={2000}
                    placeholder="For example: make the introduction more concise and keep the original meaning"
                    value={trackedInstructions[document.id] ?? ""}
                    onChange={(event) =>
                      setTrackedInstructions((current) => ({
                        ...current,
                        [document.id]: event.target.value,
                      }))
                    }
                    disabled={!canEdit || trackedBusy === document.id}
                  />
                  <Button
                    size="sm"
                    onClick={() => void proposeTrackedEdits(document)}
                    disabled={
                      !canEdit ||
                      trackedBusy === document.id ||
                      !trackedInstructions[document.id]?.trim()
                    }
                  >
                    {trackedBusy === document.id ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : null}
                    Suggest tracked changes
                  </Button>
                  {trackedErrors[document.id] && (
                    <p role="alert" className="text-xs text-destructive">
                      {trackedErrors[document.id]}
                    </p>
                  )}
                  {trackedBusy === document.id &&
                    !trackedErrors[document.id] && (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Loading tracked edits…
                      </p>
                    )}
                  {(trackedEdits[document.id] ?? []).map((edit) => (
                    <article
                      key={edit.id}
                      className="space-y-2 rounded-md border p-3"
                      aria-label={`Tracked edit ${edit.status}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium capitalize">
                          {edit.status} · {edit.changes.length} change
                          {edit.changes.length === 1 ? "" : "s"}
                        </p>
                        {(edit.status === "pending" ||
                          edit.status === "accepted") && (
                          <a
                            className="text-xs underline"
                            href={`/api/projects/${projectId}/documents/${document.id}/edits/${edit.id}/download`}
                          >
                            {edit.status === "pending"
                              ? "Download review copy"
                              : "Download accepted DOCX"}
                          </a>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {edit.changes.map((change, index) => (
                          <li
                            key={`${index}:${change.originalText}`}
                            className="space-y-1 text-xs"
                          >
                            <p className="text-destructive line-through">
                              {change.originalText}
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400">
                              {change.suggestedText}
                            </p>
                            <p className="text-muted-foreground">
                              {change.rationale}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {edit.status === "pending" &&
                        canEdit &&
                        edit.canResolve && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                void resolveTrackedEdit(
                                  document.id,
                                  edit.id,
                                  "accepted",
                                )
                              }
                              disabled={trackedBusy === edit.id}
                            >
                              Accept all
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void resolveTrackedEdit(
                                  document.id,
                                  edit.id,
                                  "rejected",
                                )
                              }
                              disabled={trackedBusy === edit.id}
                            >
                              Reject all
                            </Button>
                          </div>
                        )}
                      {edit.status === "pending" &&
                        canEdit &&
                        !edit.canResolve && (
                          <p className="text-xs text-muted-foreground">
                            Only the reviewer who created this proposal can
                            resolve it.
                          </p>
                        )}
                    </article>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
