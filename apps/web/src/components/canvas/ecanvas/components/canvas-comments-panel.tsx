"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

interface CanvasComment {
  id: string;
  elementId: string;
  body: string;
  createdAt: string;
}

export function CanvasCommentsPanel({
  canvasId,
  elementId,
}: {
  canvasId: string;
  elementId: string | null;
}) {
  const [comments, setComments] = useState<CanvasComment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!elementId) {
        setComments([]);
        return;
      }
      try {
        const response = await fetch(
          `/api/ecanvas/${canvasId}/comments?elementId=${encodeURIComponent(elementId)}`,
          { signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("Comments could not be loaded.");
        const payload = (await response.json()) as {
          comments?: CanvasComment[];
        };
        setComments(payload.comments ?? []);
        setError("");
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Comments could not be loaded.",
        );
      }
    },
    [canvasId, elementId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!elementId || !body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ecanvas/${canvasId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId, body }),
      });
      if (!response.ok) throw new Error("Comment could not be saved.");
      setBody("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Comment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (commentId: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ecanvas/${canvasId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Comment could not be deleted.");
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Comment could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="canvas-comments" aria-label="Element comments">
      <div className="canvas-comments-heading">
        <strong>Element comments</strong>
        <span>
          {elementId
            ? `Selected ${elementId.slice(0, 8)}`
            : "Select a canvas element"}
        </span>
      </div>
      {elementId ? (
        <>
          <div className="canvas-comments-list" aria-live="polite">
            {comments.length ? (
              comments.map((comment) => (
                <article className="canvas-comment" key={comment.id}>
                  <p>{comment.body}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(comment.id)}
                  >
                    Delete
                  </button>
                </article>
              ))
            ) : (
              <p className="canvas-comments-empty">
                No comments on this element yet.
              </p>
            )}
          </div>
          <form className="canvas-comment-form" onSubmit={submit}>
            <input
              aria-label="Write an element comment"
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Add a comment about this element"
            />
            <button type="submit" disabled={busy || !body.trim()}>
              Add
            </button>
          </form>
        </>
      ) : null}
      {error ? (
        <p className="canvas-comments-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
