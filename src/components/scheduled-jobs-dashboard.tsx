"use client";

import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";

type ScheduledJob = {
  id: string;
  name: string;
  cron: string;
  status: "active" | "paused" | "disabled";
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  payload: {
    triggerMessage?: string;
    scheduleType?: "once" | "recurring";
    runAt?: string;
  };
};
type ScheduledRun = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
};
type ScheduleDiagnostics = {
  now: string;
  environment: {
    cronSecret: boolean;
    internalSecret: boolean;
    baseUrl: boolean;
  };
  jobs: Array<{
    id: string;
    name: string;
    status: string;
    timezone: string;
    nextRunAt: string;
    dueNow: boolean;
  }>;
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Never";

export function ScheduledJobsDashboard() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [runs, setRuns] = useState<Record<string, ScheduledRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scheduleType, setScheduleType] = useState<"once" | "recurring">(
    "once",
  );
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [runAt, setRunAt] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState("UTC");
  const [diagnostics, setDiagnostics] = useState<ScheduleDiagnostics | null>(
    null,
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/scheduler/jobs", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load schedules.");
    const data = await response.json();
    setJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }, []);

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load schedules.",
      ),
    );
  }, [refresh]);
  useEffect(() => {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localTimezone) setTimezone(localTimezone);
  }, []);

  const update = async (job: ScheduledJob, action: "toggle" | "delete") => {
    if (
      action === "delete" &&
      !window.confirm(`Delete “${job.name}” and its run history?`)
    )
      return;
    setBusyId(job.id);
    setError(null);
    try {
      const response = await fetch(`/api/scheduler/jobs/${job.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        ...(action === "toggle"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: job.status === "active" ? "paused" : "active",
              }),
            }
          : {}),
      });
      if (!response.ok)
        throw new Error(
          action === "delete"
            ? "Could not delete schedule."
            : "Could not update schedule.",
        );
      setDiagnostics(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Schedule update failed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const loadRuns = async (jobId: string) => {
    setLoadingRuns((current) => ({ ...current, [jobId]: true }));
    setError(null);
    try {
      const response = await fetch(
        `/api/scheduler/jobs/${jobId}/runs?limit=20`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load run history.");
      const data = await response.json();
      setRuns((current) => ({
        ...current,
        [jobId]: Array.isArray(data.runs) ? data.runs : [],
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load run history.",
      );
    } finally {
      setLoadingRuns((current) => ({ ...current, [jobId]: false }));
    }
  };

  const toggleHistory = async (jobId: string) => {
    if (expanded === jobId) {
      setExpanded(null);
      return;
    }
    setExpanded(jobId);
    await loadRuns(jobId);
  };

  const createSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      if (
        scheduleType === "once" &&
        (!runAt || Number.isNaN(new Date(runAt).getTime()))
      ) {
        throw new Error("Choose a valid one-time run date and time.");
      }
      const scheduledAt =
        scheduleType === "once"
          ? new Date(
              `${runAt}${runAt.length === 16 ? ":00" : ""}Z`,
            ).toISOString()
          : undefined;
      const body = editingJobId
        ? {
            ...(title.trim() ? { name: title.trim() } : {}),
            schedule:
              scheduleType === "once"
                ? { scheduleType, prompt: prompt.trim(), runAt: scheduledAt }
                : {
                    scheduleType,
                    prompt: prompt.trim(),
                    cron: cron.trim(),
                    timezone,
                  },
          }
        : {
            scheduleType,
            title: title.trim() || undefined,
            prompt: prompt.trim(),
            ...(scheduleType === "once"
              ? { runAt: scheduledAt }
              : { cron: cron.trim(), timezone }),
          };
      const response = await fetch(
        editingJobId
          ? `/api/scheduler/jobs/${editingJobId}`
          : "/api/scheduler/jobs",
        {
          method: editingJobId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Could not create schedule.",
        );
      }
      setPrompt("");
      setTitle("");
      setRunAt("");
      setShowCreate(false);
      setEditingJobId(null);
      setDiagnostics(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create schedule.",
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleDiagnostics = async () => {
    if (diagnosticsOpen) {
      setDiagnosticsOpen(false);
      return;
    }
    setDiagnosticsOpen(true);
    if (diagnostics) return;
    setLoadingDiagnostics(true);
    setError(null);
    try {
      const response = await fetch("/api/scheduler/diagnostics", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Could not load scheduler diagnostics.");
      setDiagnostics(await response.json());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load scheduler diagnostics.",
      );
      setDiagnosticsOpen(false);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const beginEdit = (job: ScheduledJob) => {
    setEditingJobId(job.id);
    setShowCreate(true);
    setScheduleType(
      job.payload?.scheduleType === "recurring" ? "recurring" : "once",
    );
    setTitle(job.name);
    setPrompt(job.payload?.triggerMessage ?? "");
    setCron(job.cron);
    setTimezone(job.timezone || "UTC");
    setRunAt(
      job.payload?.runAt
        ? new Date(job.payload.runAt).toISOString().slice(0, 16)
        : "",
    );
  };

  const toggleCreateForm = () => {
    if (showCreate) {
      setShowCreate(false);
      setEditingJobId(null);
      setScheduleType("once");
      setTitle("");
      setPrompt("");
      setRunAt("");
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      return;
    }
    setEditingJobId(null);
    setScheduleType("once");
    setTitle("");
    setPrompt("");
    setRunAt("");
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setShowCreate(true);
  };

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Scheduled tasks</h1>
        <p className="text-sm text-muted-foreground">
          Review your scheduled assistant runs, pause tasks, and inspect recent
          run status.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void toggleDiagnostics()}>
          <Activity className="mr-2 size-4" />
          {diagnosticsOpen ? "Hide diagnostics" : "Diagnostics"}
        </Button>
        <Button variant="outline" onClick={toggleCreateForm}>
          <Plus className="mr-2 size-4" />
          {showCreate ? "Close" : "Create schedule"}
        </Button>
      </div>
      {diagnosticsOpen && (
        <section className="mb-5 rounded-lg border p-4">
          <h2 className="font-semibold">Scheduler diagnostics</h2>
          {loadingDiagnostics ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            diagnostics && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Checked {formatDate(diagnostics.now)}. Values show
                  configuration presence only.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {Object.entries(diagnostics.environment).map(
                    ([name, configured]) => (
                      <span
                        key={name}
                        className="rounded-full border px-2 py-1"
                      >
                        {name}: {configured ? "configured" : "missing"}
                      </span>
                    ),
                  )}
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {diagnostics.jobs.map((job) => (
                    <li
                      key={job.id}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span>
                        {job.name} ({job.timezone})
                      </span>
                      <span className="text-muted-foreground">
                        {job.dueNow
                          ? "Due now"
                          : job.status === "active"
                            ? `Next ${formatDate(job.nextRunAt)}`
                            : job.status}
                      </span>
                    </li>
                  ))}
                </ul>
                {diagnostics.jobs.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No scheduled tasks to check.
                  </p>
                )}
              </>
            )
          )}
        </section>
      )}
      {showCreate && (
        <form
          onSubmit={(event) => void createSchedule(event)}
          className="mb-5 space-y-3 rounded-lg border p-4"
        >
          <h2 className="font-semibold">
            {editingJobId ? "Edit schedule" : "Create schedule"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              Schedule type
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={scheduleType}
                onChange={(event) =>
                  setScheduleType(event.target.value as "once" | "recurring")
                }
              >
                <option value="once">One time</option>
                <option value="recurring">Recurring</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Name (optional)
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Daily summary"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            What should Void-Agent do?
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
              required
              maxLength={8000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Summarize my project updates…"
            />
          </label>
          {scheduleType === "once" ? (
            <label className="block space-y-1 text-sm">
              Run at (UTC)
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="datetime-local"
                required
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Choose a time at least 30 seconds in the future. The selected
                time is interpreted as UTC.
              </span>
            </label>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                Cron schedule
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 font-mono"
                  required
                  maxLength={120}
                  value={cron}
                  onChange={(event) => setCron(event.target.value)}
                />
                <span className="block text-xs text-muted-foreground">
                  Five fields: minute hour day-of-month month day-of-week.
                </span>
              </label>
              <label className="block space-y-1 text-sm">
                Timezone (IANA)
                <input
                  className="h-10 w-full rounded-md border bg-background px-3"
                  required
                  maxLength={64}
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="America/New_York"
                />
                <span className="block text-xs text-muted-foreground">
                  The cron runs in this timezone and follows daylight-saving
                  transitions.
                </span>
              </label>
            </>
          )}
          <Button type="submit" disabled={creating || !prompt.trim()}>
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {editingJobId ? "Save schedule" : "Create schedule"}
          </Button>
        </form>
      )}
      {jobs.length === 0 ? (
        <section className="rounded-lg border p-8 text-center">
          <Clock3 className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="font-medium">No scheduled tasks</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a reminder or recurring task here, or schedule one from a
            chat.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <article key={job.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{job.name}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.payload?.triggerMessage ?? "Scheduled assistant run"}
                  </p>
                  <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt className="inline font-medium">Schedule: </dt>
                      <dd className="inline">
                        {job.payload?.scheduleType === "once"
                          ? "One time"
                          : `${job.cron} (${job.timezone})`}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Next run: </dt>
                      <dd className="inline">
                        {job.status === "active"
                          ? formatDate(job.nextRunAt)
                          : "Paused"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Last run: </dt>
                      <dd className="inline">{formatDate(job.lastRunAt)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => beginEdit(job)}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">Edit {job.name}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === job.id || job.status === "disabled"}
                    onClick={() => void update(job, "toggle")}
                  >
                    {busyId === job.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : job.status === "active" ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    <span className="sr-only">
                      {job.status === "active" ? "Pause" : "Resume"} {job.name}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === job.id}
                    onClick={() => void update(job, "delete")}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Delete {job.name}</span>
                  </Button>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => void toggleHistory(job.id)}
              >
                {expanded === job.id ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                Recent runs
              </button>
              {expanded === job.id && (
                <div className="mt-2 border-t pt-2">
                  <div className="mb-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingRuns[job.id] === true}
                      onClick={() => void loadRuns(job.id)}
                    >
                      {loadingRuns[job.id] ? (
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                      ) : null}
                      Refresh history
                    </Button>
                  </div>
                  {runs[job.id] ? (
                    runs[job.id].length ? (
                      <ul className="space-y-2">
                        {runs[job.id].map((run) => (
                          <li
                            key={run.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <Check className="size-3.5 text-muted-foreground" />
                              {formatDate(run.startedAt)}
                            </span>
                            <span className="capitalize text-muted-foreground">
                              {run.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No runs recorded yet.
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Loading run history…
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
