"use client";

import {
  CyberCopyButton,
  CyberDialog,
  CyberPageHeader,
  CyberSkeletonTable,
  SeverityBadge,
} from "@/components/cyber/cyber-ui";
import { Markdown } from "@/components/markdown";
import { cn } from "lib/utils";
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";

type Report = {
  id: string;
  findingId: string;
  reportFormat: string;
  compiledPayload?: Record<string, unknown>;
  qualityScore: number;
  qualityFeedback?: string[];
  createdAt: string;
  exportedAt: string | null;
};

type Finding = { id: string; title: string; severity: string };

const FORMAT_LABELS: Record<string, string> = {
  markdown: "Markdown",
  json: "JSON",
  pdf: "PDF",
};

function PreviewReportModal({
  report,
  onClose,
  onDownload,
}: {
  report: Report;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const payload = report.compiledPayload ?? {};
  const markdown =
    typeof payload.markdown === "string"
      ? payload.markdown
      : JSON.stringify(payload, null, 2);
  const isJsonReport = report.reportFormat === "json";
  const feedback = Array.isArray(report.qualityFeedback)
    ? report.qualityFeedback
    : [];

  return (
    <CyberDialog
      title="Compiled Security Report"
      description={`Quality Score: ${report.qualityScore}/100 · Format: ${FORMAT_LABELS[report.reportFormat] ?? report.reportFormat}`}
      onClose={onClose}
      maxWidth="max-w-3xl"
      headerActions={
        <>
          <CyberCopyButton value={markdown} label="Copy" />
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition-colors"
          >
            <Download className="size-3.5" /> Download
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {feedback.length > 0 && (
          <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs space-y-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Quality Improvement Suggestions
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              {feedback.map((tip, i) => (
                <li key={i}>{String(tip)}</li>
              ))}
            </ul>
          </div>
        )}

        {!isJsonReport && (
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border">
            <button
              type="button"
              onClick={() => setViewMode("rendered")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                viewMode === "rendered"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                viewMode === "raw"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Raw Markdown
            </button>
          </div>
        )}

        {viewMode === "rendered" && !isJsonReport ? (
          <div className="bg-background border border-border rounded-xl p-5 prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{markdown}</Markdown>
          </div>
        ) : (
          <pre className="bg-background border border-border rounded-xl p-4 text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {isJsonReport ? JSON.stringify(payload, null, 2) : markdown}
          </pre>
        )}
      </div>
    </CyberDialog>
  );
}

function CompileReportPanel({
  findings,
  onClose,
  onCompiled,
}: {
  findings: Finding[];
  onClose: () => void;
  onCompiled: (report: Report) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState("markdown");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFinding(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCompile() {
    if (selected.size === 0) {
      setError("Select at least one finding.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/cyber/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingIds: Array.from(selected), format }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to compile report");
        return;
      }
      onCompiled(data.report);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Compile Vulnerability Report"
      description="Select one or more findings to generate a structured Markdown or JSON export."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No findings available yet. Log a finding first.
            </p>
          ) : (
            findings.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFinding(f.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                  selected.has(f.id)
                    ? "bg-cyan-500/10 border-cyan-500/35"
                    : "bg-background border-border hover:border-muted-foreground/40",
                )}
              >
                {selected.has(f.id) ? (
                  <CheckSquare className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                ) : (
                  <Square className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm text-foreground flex-1 truncate">
                  {f.title}
                </span>
                <SeverityBadge severity={f.severity} />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-muted-foreground shrink-0">
            Export Format
          </label>
          <div className="relative flex-1">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 pr-8"
            >
              <option value="markdown">Markdown (.md)</option>
              <option value="json">Structured JSON (.json)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleCompile}
          disabled={submitting || selected.size === 0}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          {submitting
            ? "Compiling…"
            : `Compile Report (${selected.size} finding${selected.size === 1 ? "" : "s"})`}
        </button>
      </div>
    </CyberDialog>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompile, setShowCompile] = useState(false);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/cyber/reports").then((r) => r.json()),
      fetch("/api/cyber/findings").then((r) => r.json()),
    ])
      .then(([repData, findData]) => {
        setReports(repData.reports ?? []);
        setFindings(findData.findings ?? []);
      })
      .catch(() => setError("Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(reportId: string, fmt: string) {
    const res = await fetch(`/api/cyber/reports/${reportId}?download=1`);
    const data = await res.json();
    const report: Report | undefined = data.report;
    if (!report) return;

    setReports((prev) =>
      prev.map((r) =>
        r.id === report.id ? { ...r, exportedAt: report.exportedAt } : r,
      ),
    );

    const payload = report.compiledPayload ?? {};
    const content =
      fmt === "json"
        ? JSON.stringify(payload, null, 2)
        : typeof payload.markdown === "string"
          ? payload.markdown
          : JSON.stringify(payload, null, 2);

    const blob = new Blob([content], {
      type: fmt === "json" ? "application/json" : "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `void-cyber-report-${reportId.slice(0, 8)}.${fmt === "json" ? "json" : "md"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Vulnerability Reports"
        description="Compiled triage-ready security reports with automated completeness scoring."
        actions={
          <button
            type="button"
            onClick={() => setShowCompile(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Compile Report
          </button>
        }
      />

      {loading && <CyberSkeletonTable rows={4} />}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <FileText className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No reports compiled yet
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Select verified findings to generate structured Markdown or JSON
            disclosure reports with quality feedback.
          </p>
          <button
            type="button"
            onClick={() => setShowCompile(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Compile First Report
          </button>
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  "Format",
                  "Quality Score",
                  "Created",
                  "Last Exported",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30">
                      {FORMAT_LABELS[r.reportFormat] ?? r.reportFormat}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        r.qualityScore >= 80
                          ? "text-emerald-600 dark:text-emerald-400"
                          : r.qualityScore >= 50
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {r.qualityScore}/100
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {r.exportedAt
                      ? new Date(r.exportedAt).toLocaleDateString()
                      : "Not exported"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewReport(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Eye className="size-3.5" /> Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(r.id, r.reportFormat)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Download className="size-3.5" /> Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCompile && (
        <CompileReportPanel
          findings={findings}
          onClose={() => setShowCompile(false)}
          onCompiled={(r) => {
            setReports((prev) => [r, ...prev]);
            setShowCompile(false);
            setPreviewReport(r);
          }}
        />
      )}

      {previewReport && (
        <PreviewReportModal
          report={previewReport}
          onClose={() => setPreviewReport(null)}
          onDownload={() =>
            handleDownload(previewReport.id, previewReport.reportFormat)
          }
        />
      )}
    </div>
  );
}
