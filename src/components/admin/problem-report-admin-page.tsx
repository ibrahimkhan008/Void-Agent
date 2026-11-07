"use client";

import { useCallback, useEffect, useState } from "react";

type ReportStatus = "open" | "in_review" | "resolved";
type Report = {
  id: string;
  userId: string;
  description: string;
  screenshots: Array<{ name: string; contentType: string; size: number }>;
  context: Record<string, unknown> | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
};
const PAGE_SIZE = 25;

export function ProblemReportAdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (statusFilter !== "all") query.set("status", statusFilter);
        const response = await fetch(`/api/admin/problem-reports?${query}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Unable to load reports");
        setReports(data.reports ?? []);
        setHasMore(Boolean(data.hasMore));
        setOffset(nextOffset);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load reports",
        );
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function updateStatus(id: string, status: ReportStatus) {
    setSaving(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/problem-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update status");
      await load(offset);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update status",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Problem reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review reports submitted by users.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No problem reports found.
        </p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <article
              key={report.id}
              className="space-y-4 rounded-lg border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {report.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {new Date(report.createdAt).toLocaleString()} ·
                    User {report.userId}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  Status
                  <select
                    aria-label={`Status for report ${report.id}`}
                    className="rounded-md border bg-background px-2 py-1.5"
                    disabled={saving === report.id}
                    value={report.status}
                    onChange={(event) =>
                      void updateStatus(
                        report.id,
                        event.target.value as ReportStatus,
                      )
                    }
                  >
                    <option value="open">Open</option>
                    <option value="in_review">In review</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
              </div>
              {report.screenshots.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Attachments:{" "}
                  {report.screenshots
                    .map(
                      (shot) =>
                        `${shot.name} (${shot.contentType}, ${Math.ceil(shot.size / 1024)} KB)`,
                    )
                    .join(", ")}
                </div>
              )}
              {report.context && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Diagnostic context
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3">
                    {JSON.stringify(report.context, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      <nav
        className="flex items-center justify-between"
        aria-label="Report pages"
      >
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={loading || offset === 0}
          onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground">
          Showing {reports.length ? offset + 1 : 0}–{offset + reports.length}
        </span>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={loading || !hasMore}
          onClick={() => void load(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </nav>
    </main>
  );
}
