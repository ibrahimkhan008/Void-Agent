"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth/client";
import {
  type ScheduleFrequency,
  cronToScheduleInput,
  getCommonTimezones,
  getUserTimezone,
  timeToCron,
} from "@/lib/scheduled-tasks/time-to-cron";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

/**
 * Schedule config captured before the agent exists (create flow). The parent
 * holds it and submits it right after the agent is created.
 */
export type DeferredScheduleConfig = {
  cronExpression: string;
  timezone: string;
  inputPrompt: string | null;
  browserAutomationEnabled: boolean;
  browserCredentialAliases: string[];
  enabled: true;
};

export type ScheduledExecutionMode = "agent" | "chat" | "cloud-agent";

type BrowserCredentialOption = {
  alias: string;
  label: string | null;
  domain: string;
};

export interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskType: "agent";
  /** Absent while the agent is being created — the dialog defers the config. */
  taskId?: string;
  taskName?: string;
  initialName?: string;
  initialPrompt?: string;
  initialFrequency?: ScheduleFrequency;
  initialExecutionMode?: ScheduledExecutionMode;
  allowExecutionModeChange?: boolean;
  existingSchedule?: any;
  /**
   * Name of the schedule within the agent. New schedules pass a fresh key so
   * they upsert as a distinct row instead of overwriting the "default" one.
   */
  scheduleKey?: string;
  onScheduleCreated?: () => void;
  /** Called instead of the API when taskId is absent (create flow). */
  onSubmitDeferred?: (config: DeferredScheduleConfig) => void;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  taskType,
  taskId,
  taskName,
  initialName,
  initialPrompt,
  initialFrequency,
  initialExecutionMode,
  allowExecutionModeChange = false,
  existingSchedule,
  scheduleKey,
  onScheduleCreated,
  onSubmitDeferred,
}: ScheduleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [frequency, setFrequency] = useState<ScheduleFrequency>("daily");
  const [executionMode, setExecutionMode] = useState<ScheduledExecutionMode>(
    initialExecutionMode ?? "agent",
  );
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [customCron, setCustomCron] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState(getUserTimezone());
  const [inputPrompt, setInputPrompt] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [description, setDescription] = useState("");
  const [browserAutomationEnabled, setBrowserAutomationEnabled] =
    useState(false);
  const [credentialAliases, setCredentialAliases] = useState<string[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("none");
  const tBrowser = useTranslations("Agent.scheduleBrowser");

  // Only the org's stored sign-ins can be pinned, and the server re-checks the
  // list anyway — this is for the picker, not for authorization.
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: agentOptions = [], isLoading: agentsLoading } = useSWR<
    { id: string; name: string }[]
  >(
    open && allowExecutionModeChange
      ? "/api/agent?filters=mine,shared&limit=100"
      : null,
    (url: string) =>
      fetch(url).then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load agents")),
      ),
  );
  const { data: credentialData } = useSWR<{
    credentials: BrowserCredentialOption[];
  }>(
    browserAutomationEnabled && activeOrg?.id
      ? `/api/organization/${activeOrg.id}/browser-credentials`
      : null,
    (url: string) =>
      fetch(url).then((res) => (res.ok ? res.json() : { credentials: [] })),
  );

  // Pre-fill form with existing schedule data (a stored task or a pending
  // deferred config from the create flow — both carry the same fields).
  useEffect(() => {
    if (existingSchedule) {
      setExecutionMode(existingSchedule.executionMode || "agent");
      setSelectedAgentId(taskId || existingSchedule.agentId || "none");
      setScheduleName(existingSchedule.name || "");
      setDescription(existingSchedule.description || "");
      setInputPrompt(existingSchedule.inputPrompt || "");
      setBrowserAutomationEnabled(
        Boolean(existingSchedule.browserAutomationEnabled),
      );
      setCredentialAliases(existingSchedule.browserCredentialAliases ?? []);
      setTimezone(existingSchedule.timezone || getUserTimezone());

      // Parse cron back to form fields
      const parsed = cronToScheduleInput(existingSchedule.cronExpression);
      if (parsed) {
        if (parsed.frequency) setFrequency(parsed.frequency);
        if (parsed.time) setTime(parsed.time);
        if (parsed.dayOfWeek !== undefined) setDayOfWeek(parsed.dayOfWeek);
        if (parsed.dayOfMonth !== undefined) setDayOfMonth(parsed.dayOfMonth);
        if (parsed.customCron) setCustomCron(parsed.customCron);
      }
    } else {
      setExecutionMode(
        initialExecutionMode || (taskId || taskName ? "agent" : "chat"),
      );
      setSelectedAgentId(taskId || "none");
      setScheduleName(initialName || "");
      setDescription("");
      setInputPrompt(initialPrompt || "");
      setBrowserAutomationEnabled(false);
      setCredentialAliases([]);
      setFrequency(initialFrequency || "daily");
      setTime("09:00");
      setDayOfWeek(1);
      setDayOfMonth(1);
      setCustomCron("0 9 * * 1-5");
      setTimezone(getUserTimezone());
    }
  }, [
    existingSchedule,
    initialName,
    initialPrompt,
    initialFrequency,
    initialExecutionMode,
    open,
    taskId,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let cronExpression: string;
    try {
      cronExpression = timeToCron({
        frequency,
        time: frequency === "hourly" ? undefined : time,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        customCron: frequency === "custom" ? customCron : undefined,
        timezone,
      });
    } catch {
      toast.error("Invalid schedule. Please check time and frequency.");
      return;
    }

    // Create flow: the agent does not exist yet, hand the config to the
    // parent, which saves it right after the agent is created.
    if (onSubmitDeferred) {
      onSubmitDeferred?.({
        cronExpression,
        timezone,
        inputPrompt: inputPrompt || null,
        browserAutomationEnabled,
        browserCredentialAliases: credentialAliases,
        enabled: true,
      });
      onOpenChange(false);
      return;
    }

    const effectiveAgentId =
      taskId || (selectedAgentId !== "none" ? selectedAgentId : undefined);
    if (executionMode === "agent" && !effectiveAgentId) {
      toast.error("Choose an agent before creating an agent schedule.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        taskType,
        executionMode,
        ...(effectiveAgentId ? { agentId: effectiveAgentId } : {}),
        ...(allowExecutionModeChange && !effectiveAgentId
          ? { agentId: null }
          : {}),
        name: scheduleName || undefined,
        description: description || null,
        // Preserve the schedule's key on edit; new schedules use the passed key
        // (or "default"). The POST route upserts on (agentId, key).
        key: existingSchedule?.key ?? scheduleKey ?? "default",
        cronExpression,
        timezone,
        inputPrompt,
        browserAutomationEnabled,
        browserCredentialAliases: credentialAliases,
        enabled: true,
      };

      const url = existingSchedule?.id
        ? `/api/scheduled-tasks/${existingSchedule.id}`
        : "/api/scheduled-tasks";
      const method = existingSchedule?.id ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error ||
            (existingSchedule?.id
              ? "Failed to update schedule"
              : "Failed to create schedule"),
        );
      }

      onOpenChange(false);
      onScheduleCreated?.();
    } catch (error) {
      console.error("Error creating schedule:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : existingSchedule?.id
            ? "Failed to update the schedule. Please try again."
            : "Failed to create the schedule. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingSchedule
              ? `Edit ${existingSchedule.name || "schedule"}`
              : taskName
                ? `Schedule ${taskName}`
                : "Create New Schedule"}
          </DialogTitle>
          <DialogDescription>
            Choose what runs and when it should run automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {allowExecutionModeChange ? (
            <div className="space-y-2">
              <Label htmlFor="executionMode">Execution Mode</Label>
              <Select
                value={executionMode}
                onValueChange={(value) =>
                  setExecutionMode(value as ScheduledExecutionMode)
                }
              >
                <SelectTrigger id="executionMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat">
                    Chat AI (Web Search + Memory)
                  </SelectItem>
                  <SelectItem value="cloud-agent">
                    Cloud Agent (Autonomous Sandbox)
                  </SelectItem>
                  <SelectItem value="agent">
                    Custom Agent (instructions + tools)
                  </SelectItem>
                </SelectContent>
              </Select>
              {!taskId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="scheduleAgent">Agent (optional)</Label>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/agent/new">
                        <Plus aria-hidden="true" />
                        Create New Agent
                      </Link>
                    </Button>
                  </div>
                  <Select
                    value={selectedAgentId}
                    onValueChange={setSelectedAgentId}
                    disabled={agentsLoading}
                  >
                    <SelectTrigger id="scheduleAgent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No agent</SelectItem>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {executionMode === "agent" && selectedAgentId === "none" && (
                    <p className="text-xs text-muted-foreground">
                      Select an agent for Custom Agent mode, or switch to Chat
                      AI or Cloud Agent to run without one.
                    </p>
                  )}
                </div>
              )}
              {executionMode === "cloud-agent" && (
                <p className="text-xs text-muted-foreground">
                  Runs code in an E2B sandbox. Only files attached to the run
                  can be inspected; local files and private repositories are not
                  accessed automatically. E2B must be configured on the server
                  before Cloud Agent schedules can be created.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Execution Mode</Label>
              <p className="text-sm text-muted-foreground">
                {executionMode === "agent"
                  ? `Custom Agent${taskName ? ` · ${taskName}` : ""}`
                  : executionMode === "cloud-agent"
                    ? "Cloud Agent (Autonomous Sandbox)"
                    : "Chat AI (Web Search + Memory)"}
              </p>
              {taskId && executionMode !== "agent" && (
                <p className="text-sm text-muted-foreground">
                  Using agent instructions and tools:{" "}
                  {taskName || "Selected agent"}
                </p>
              )}
            </div>
          )}

          {/* Input Prompt — the user message of every scheduled run */}
          <div className="space-y-2">
            <Label htmlFor="scheduleName">Schedule name</Label>
            <Input
              id="scheduleName"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder={`Scheduled ${taskName || "agent"}`}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduleDescription">Description (optional)</Label>
            <Input
              id="scheduleDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of this schedule"
              maxLength={2000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inputPrompt">
              Task Prompt / Instructions{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="inputPrompt"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Describe the exact task to perform when this schedule triggers..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Sent as the user message on every scheduled run. If empty, the
              selected execution mode uses a generic prompt.
            </p>
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(value) =>
                setFrequency(value as ScheduleFrequency)
              }
            >
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="daily">Every Day</SelectItem>
                <SelectItem value="weekdays">Weekdays (Mon – Fri)</SelectItem>
                <SelectItem value="weekly">Every Week</SelectItem>
                <SelectItem value="monthly">Every Month</SelectItem>
                <SelectItem value="custom">Custom Cron</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="customCron">Cron expression</Label>
              <Input
                id="customCron"
                value={customCron}
                onChange={(event) => setCustomCron(event.target.value)}
                placeholder="0 9 * * 1-5"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use standard five-field cron syntax: minute hour day-of-month
                month day-of-week. The server validates it before saving.
              </p>
            </div>
          )}

          {/* Time (not shown for hourly) */}
          {frequency !== "hourly" && (
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          {/* Day of Week (only for weekly) */}
          {frequency === "weekly" && (
            <div className="space-y-2">
              <Label htmlFor="dayOfWeek">Day of Week</Label>
              <Select
                value={dayOfWeek.toString()}
                onValueChange={(value) => setDayOfWeek(Number.parseInt(value))}
              >
                <SelectTrigger id="dayOfWeek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sunday</SelectItem>
                  <SelectItem value="1">Monday</SelectItem>
                  <SelectItem value="2">Tuesday</SelectItem>
                  <SelectItem value="3">Wednesday</SelectItem>
                  <SelectItem value="4">Thursday</SelectItem>
                  <SelectItem value="5">Friday</SelectItem>
                  <SelectItem value="6">Saturday</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Day of Month (only for monthly) */}
          {frequency === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="dayOfMonth">Day of Month</Label>
              <Select
                value={dayOfMonth.toString()}
                onValueChange={(value) => setDayOfMonth(Number.parseInt(value))}
              >
                <SelectTrigger id="dayOfMonth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dayOfMonth > 28 && (
                <p className="text-xs text-muted-foreground">
                  Only runs in months that have day {dayOfMonth}.
                </p>
              )}
            </div>
          )}

          {/* Browser automation. Off by default and per-schedule, because an
              unattended browser run signs itself in and bills browser-seconds
              with nobody watching the result. */}
          {executionMode === "agent" && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="browserAutomation">
                    {tBrowser("enable")}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tBrowser("enableDescription")}
                  </p>
                </div>
                <Switch
                  id="browserAutomation"
                  checked={browserAutomationEnabled}
                  onCheckedChange={setBrowserAutomationEnabled}
                />
              </div>
              {browserAutomationEnabled && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium">
                    {tBrowser("credentials")}
                  </p>
                  {(credentialData?.credentials.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {tBrowser("noCredentials")}
                    </p>
                  ) : (
                    credentialData?.credentials.map((credential) => (
                      <label
                        key={credential.alias}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={credentialAliases.includes(credential.alias)}
                          onChange={(e) =>
                            setCredentialAliases((current) =>
                              e.target.checked
                                ? [...current, credential.alias]
                                : current.filter((a) => a !== credential.alias),
                            )
                          }
                        />
                        <span>
                          {credential.label || credential.alias}
                          <span className="text-muted-foreground ml-1.5">
                            {credential.domain}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                  <p className="text-xs text-muted-foreground">
                    {tBrowser("credentialsWarning")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Render the stored timezone even if it isn't one of the
                    common options (API/voice-created tasks accept any IANA
                    zone), so editing never silently rewrites it. */}
                {!getCommonTimezones().some((tz) => tz.value === timezone) && (
                  <SelectItem value={timezone}>{timezone}</SelectItem>
                )}
                {getCommonTimezones().map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? existingSchedule
                  ? "Updating..."
                  : "Creating..."
                : existingSchedule
                  ? "Update Schedule"
                  : onSubmitDeferred
                    ? "Set Schedule"
                    : "Create Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
