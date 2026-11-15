"use client";

import { ScheduleDialog } from "@/components/scheduled-tasks/schedule-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ScheduledTaskSummary,
  useScheduledTasks,
} from "@/hooks/queries/use-scheduled-tasks";
import { cronToHumanReadable } from "@/lib/scheduled-tasks/time-to-cron";
import { randomId } from "@/lib/utils";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Filter = "all" | "active" | "paused" | "chat" | "cloud-agent";

export function SchedulesPage() {
  const { tasks, isLoading, mutate } = useScheduledTasks();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleKey, setScheduleKey] = useState("");
  const [editing, setEditing] = useState<ScheduledTaskSummary | undefined>();
  const [template, setTemplate] = useState<{
    name: string;
    prompt: string;
    frequency: "daily" | "weekdays" | "weekly";
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === "active" && !task.enabled) return false;
      if (filter === "paused" && task.enabled) return false;
      if (filter === "chat" && task.executionMode !== "chat") return false;
      if (filter === "cloud-agent" && task.executionMode !== "cloud-agent")
        return false;
      return (
        !query ||
        [task.name, task.description, task.agentName].some((value) =>
          value?.toLowerCase().includes(query),
        )
      );
    });
  }, [filter, search, tasks]);

  const activeCount = tasks.filter((task) => task.enabled).length;
  const pausedCount = tasks.length - activeCount;
  const runCount = tasks.reduce(
    (total, task) => total + (task.runCount ?? 0),
    0,
  );

  const openCreate = () => {
    setScheduleKey(`schedule-${randomId()}`);
    setEditing(undefined);
    setTemplate(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setScheduleKey("");
    setEditing(undefined);
    setTemplate(null);
  };

  const toggleEnabled = async (task: ScheduledTaskSummary) => {
    setPendingId(task.id);
    try {
      const response = await fetch(`/api/scheduled-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      if (!response.ok) throw new Error("Could not update schedule");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update schedule",
      );
    } finally {
      setPendingId(null);
    }
  };

  const runNow = async (task: ScheduledTaskSummary) => {
    setPendingId(task.id);
    try {
      const response = await fetch(`/api/scheduled-tasks/${task.id}/run`, {
        method: "POST",
        headers: { "Idempotency-Key": randomId() },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.skipped || result?.success === false) {
        throw new Error(
          result?.reason || result?.error || "Could not run schedule",
        );
      }
      toast.success("Scheduled run started");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not run schedule",
      );
    } finally {
      setPendingId(null);
    }
  };

  const deleteTask = async (task: ScheduledTaskSummary) => {
    if (!window.confirm(`Delete “${task.name}”?`)) return;
    setPendingId(task.id);
    try {
      const response = await fetch(`/api/scheduled-tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete schedule");
      await mutate();
      toast.success("Schedule deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete schedule",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="mt-1 flex size-10 items-center justify-center rounded-xl border bg-secondary">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Schedules</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Schedule Chat AI research, Cloud Agent sandbox tasks, or a custom
              agent to run on a recurring cadence.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void mutate()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New Schedule
          </Button>
        </div>
      </header>

      <section className="rounded-xl border bg-card p-4 text-sm">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 size-4 text-primary" />
          <div>
            <p className="font-medium">
              Choose how each scheduled run executes
            </p>
            <p className="mt-1 text-muted-foreground">
              Chat AI runs with web search and memory. Cloud Agent runs code in
              an E2B sandbox. Custom Agent schedules use the selected agent’s
              instructions and tools. A Cloud Agent does not automatically get
              your local files or private repositories; attach or provide the
              code it should inspect.
            </p>
          </div>
        </div>
      </section>

      <section
        aria-label="Schedule summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Stat
          label="Total schedules"
          value={tasks.length}
          icon={<CalendarClock className="size-4" />}
        />
        <Stat
          label="Active"
          value={activeCount}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
        />
        <Stat
          label="Paused"
          value={pausedCount}
          icon={<Pause className="size-4 text-amber-500" />}
        />
        <Stat
          label="Total runs"
          value={runCount}
          icon={<Zap className="size-4 text-blue-500" />}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex rounded-lg border p-1"
            aria-label="Filter schedules"
          >
            {(["all", "active", "paused", "chat", "cloud-agent"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`rounded-md px-3 py-1.5 text-sm ${filter === value ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {value === "chat"
                    ? "Chat AI"
                    : value === "cloud-agent"
                      ? "Cloud Agent"
                      : value}
                </button>
              ),
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search schedules…"
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
            Loading schedules…
          </div>
        ) : filteredTasks.length ? (
          <div className="grid gap-3">
            {filteredTasks.map((task) => (
              <ScheduleCard
                key={task.id}
                task={task}
                busy={pendingId === task.id}
                onToggle={() => void toggleEnabled(task)}
                onRun={() => void runNow(task)}
                onEdit={() => {
                  setEditing(task);
                  setTemplate(null);
                  setScheduleKey("");
                  setDialogOpen(true);
                }}
                onDelete={() => void deleteTask(task)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary">
              <CalendarClock className="size-5 text-muted-foreground" />
            </span>
            <h2 className="font-semibold">
              {tasks.length
                ? "No matching schedules"
                : "No schedules created yet"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {tasks.length
                ? "Try another search or filter."
                : "Create a recurring Chat AI, Cloud Agent, or custom-agent run to get started."}
            </p>
            {!tasks.length && (
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                Create Schedule
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Quick-start templates</h2>
          <p className="text-sm text-muted-foreground">
            Choose a starter prompt, then select Chat AI, Cloud Agent, or a
            custom agent.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              name: "Daily AI & tech briefing",
              prompt:
                "Search for today's important AI and technology updates and summarize the most useful stories.",
              frequency: "daily" as const,
            },
            {
              name: "Weekday market pulse",
              prompt:
                "Summarize today's market movements, notable launches, and competitor updates.",
              frequency: "weekdays" as const,
            },
            {
              name: "Weekly research digest",
              prompt:
                "Prepare a structured weekly research digest with key findings, sources, and open questions.",
              frequency: "weekly" as const,
            },
          ].map((item) => (
            <article key={item.name} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">{item.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {item.prompt}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 px-0"
                onClick={() => {
                  setTemplate(item);
                  setScheduleKey(`schedule-${randomId()}`);
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-1 size-3.5" />
                Use template
              </Button>
            </article>
          ))}
        </div>
      </section>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
        taskType="agent"
        taskId={editing?.agentId ?? undefined}
        taskName={editing?.agentName ?? undefined}
        initialName={template?.name}
        initialPrompt={template?.prompt}
        initialFrequency={template?.frequency}
        initialExecutionMode={editing?.executionMode ?? "chat"}
        allowExecutionModeChange={!editing}
        existingSchedule={editing}
        scheduleKey={scheduleKey || undefined}
        onScheduleCreated={() => {
          void mutate();
          closeDialog();
        }}
      />
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </div>
      {icon}
    </div>
  );
}

function ScheduleCard({
  task,
  busy,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: {
  task: ScheduledTaskSummary;
  busy: boolean;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold">{task.name}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${task.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
            >
              {task.enabled ? "Active" : "Paused"}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {task.executionMode === "cloud-agent"
                ? "Cloud Agent"
                : task.executionMode === "chat"
                  ? "Chat AI"
                  : "Custom Agent"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {task.agentName ? `${task.agentName} · ` : ""}
            {cronToHumanReadable(task.cronExpression, task.timezone)}
          </p>
          {task.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={onRun}>
            {busy ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            Run now
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onToggle}
          >
            {task.enabled ? (
              <Pause className="mr-1 size-3.5" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            {task.enabled ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${task.name}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" />
          {task.nextRunAt && task.enabled
            ? `Next ${new Date(task.nextRunAt).toLocaleString()}`
            : task.enabled
              ? "Next run pending"
              : "No upcoming run"}
        </span>
        <span>{task.runCount ?? 0} runs</span>
        <span>
          {task.lastRunAt
            ? `Last run ${new Date(task.lastRunAt).toLocaleString()}${task.lastRunStatus ? ` · ${task.lastRunStatus}` : ""}`
            : "Never run"}
        </span>
      </div>
      {task.lastRunError && (
        <p className="mt-2 text-xs text-destructive">{task.lastRunError}</p>
      )}
    </article>
  );
}
