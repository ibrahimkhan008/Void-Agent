"use client";

import { useFileUpload } from "@/hooks/use-presigned-upload";
import {
  PROBLEM_REPORT_DESCRIPTION_MAX,
  PROBLEM_REPORT_SCREENSHOT_BYTES_MAX,
  PROBLEM_REPORT_SCREENSHOT_MAX,
  type ProblemReportScreenshot,
} from "@/types/problem-report";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

type Report = {
  id: string;
  description: string;
  status: "open" | "in_review" | "resolved";
  createdAt: string;
  screenshots: { name: string; url: string; contentType: string; size: number }[];
};

function isAllowedImageType(
  contentType: string,
): contentType is ProblemReportScreenshot["contentType"] {
  return (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp" ||
    contentType === "image/gif"
  );
}

const STATUS_LABEL: Record<Report["status"], string> = {
  open: "Submitted",
  in_review: "In review",
  resolved: "Resolved",
};

async function readJson<T>(response: Response): Promise<T> {
  const value = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !value) throw new Error("request failed");
  return value;
}

export function ProblemReportsPage() {
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { upload } = useFileUpload();

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch("/api/problem-report", {
        cache: "no-store",
      });
      const data = await readJson<{ reports: Report[] }>(response);
      setReports(data.reports);
    } catch {
      toast.error("Could not load your issue reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = [...files];
    for (const file of Array.from(selected)) {
      if (!isAllowedImageType(file.type)) {
        toast.error(`${file.name}: use PNG, JPEG, WebP, or GIF.`);
        continue;
      }
      if (file.size <= 0 || file.size > PROBLEM_REPORT_SCREENSHOT_BYTES_MAX) {
        toast.error(`${file.name}: screenshots must be 10 MB or smaller.`);
        continue;
      }
      if (next.length >= PROBLEM_REPORT_SCREENSHOT_MAX) {
        toast.error(`Attach up to ${PROBLEM_REPORT_SCREENSHOT_MAX} screenshots.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const submit = async () => {
    const trimmed = description.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const screenshots: ProblemReportScreenshot[] = [];
      for (const file of files) {
        if (!isAllowedImageType(file.type)) {
          throw new Error("invalid screenshot type");
        }
        const result = await upload(file, {
          filename: file.name,
          contentType: file.type,
        });
        if (!result) throw new Error("upload failed");
        screenshots.push({
          key: result.pathname,
          name: file.name,
          contentType: file.type,
          size: file.size,
        });
      }
      const response = await fetch("/api/problem-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          screenshots,
          context: {
            pageUrl: window.location.href,
            userAgent: navigator.userAgent.slice(0, 512),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          },
        }),
      });
      await readJson<{ id: string; status: Report["status"] }>(response);
      setDescription("");
      setFiles([]);
      toast.success("Your report was submitted.");
      await loadReports();
    } catch {
      toast.error("Could not submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Report an issue</h1>
        <p className="text-sm text-muted-foreground">
          Describe what happened. Reports and their status are visible only to you.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border p-5">
        <label htmlFor="problem-report-description" className="text-sm font-medium">
          What went wrong?
        </label>
        <textarea
          id="problem-report-description"
          className="min-h-36 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={PROBLEM_REPORT_DESCRIPTION_MAX}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Tell us what you expected and what happened instead."
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Attach screenshots"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!description.trim() || submitting}
          >
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="flex gap-2">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your reports</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border p-5 text-sm text-muted-foreground">
            You haven’t submitted an issue report yet.
          </p>
        ) : (
          reports.map((report) => (
            <article key={report.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(report.createdAt).toLocaleString()}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {STATUS_LABEL[report.status] ?? "Submitted"}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{report.description}</p>
              {report.screenshots.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {report.screenshots.map((shot) => (
                    <a
                      key={shot.url}
                      href={shot.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      {shot.name}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
