import { AppDefaultToolkit } from "lib/ai/tools";

/**
 * Whether a human is present for this chat run.
 *
 * This is deliberately NOT the same thing as `headless`, which the chat route
 * already tracks. `headless` answers "can a client-side tool (one declared
 * without an `execute`) ever be answered here?" — a precise, load-bearing
 * question that `loadAppDefaultTools` depends on. It happens to be true on the
 * same requests as `unattended` today, but the two mean different things and
 * conflating them is what made the browser tool unavailable to scheduled
 * agents: it was suppressed by a flag that really meant "no client-side tools".
 *
 * `unattended` answers "is anyone watching, and can anyone be asked?". It gates
 * the browser tool's sign-in behaviour, the human-in-the-loop tools, and the
 * per-run cost brakes.
 *
 * Kept free of `server-only` so it can be imported from tests and from the
 * scheduled-task runner.
 */
export type ChatRunMode = "interactive" | "unattended";

/** Header the scheduled-task loopback uses to name the task it is running. */
export const SCHEDULED_TASK_ID_HEADER = "X-Scheduled-Task-Id";

/**
 * `scheduled_task.executionMode` value marking a Cloud Agent run. Its contract
 * is that the run's work executes on the E2B sandbox — task creation gates on
 * `E2B_API_KEY`, and the chat route must actually bind the E2B-backed code
 * tools when the task row says this mode.
 */
export const CLOUD_AGENT_EXECUTION_MODE = "cloud-agent";

export function isUnattended(mode: ChatRunMode): boolean {
  return mode === "unattended";
}

/**
 * The app-default toolkits an unattended run may actually load, after the
 * scheduled-task row has its say.
 *
 * For a Cloud Agent run the Code toolkit — the E2B-backed python/javascript
 * execution tools — is unioned in unconditionally: the mode's promise ("this
 * task runs on an isolated E2B sandbox") must not depend on what the loopback
 * request body happens to carry. The task row is the authority, the same
 * fail-closed principle `loadUnattendedContext` applies to browser grants.
 *
 * Every other mode (and interactive runs) passes the caller's list through
 * untouched.
 */
export function resolveUnattendedToolkits(input: {
  executionMode?: string | null;
  allowedAppDefaultToolkit?: string[];
}): string[] | undefined {
  if (input.executionMode !== CLOUD_AGENT_EXECUTION_MODE) {
    return input.allowedAppDefaultToolkit;
  }
  return Array.from(
    new Set([
      ...(input.allowedAppDefaultToolkit ?? []),
      AppDefaultToolkit.Code,
    ]),
  );
}
