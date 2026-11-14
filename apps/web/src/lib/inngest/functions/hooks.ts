import { inngest } from "../client";
import { runHookAgent } from "lib/hooks/executor";
import logger from "logger";

/**
 * Void Hooks executor (master prompt §3.5): consumes a dispatched hook run
 * and drives the bound agent end to end. Production path alongside the
 * secret-gated /api/hooks/tick (which runs the same executor synchronously
 * so the feature is provable without an Inngest registration).
 *
 * Idempotency and loop prevention live in lib/hooks/executor (hook_run row
 * + atomic claim + cooldown + daily cap), so a duplicated Inngest event is
 * harmless: the second invocation sees the run already running/finished and
 * skips.
 */
export const hookAgentRun = inngest.createFunction(
  { id: "void-hooks-agent-run", retries: 2 },
  { event: "void/hooks.agent-run" },
  async ({ event, step }) => {
    const runId = (event.data as { runId?: string })?.runId;
    if (!runId) {
      logger.error("[hooks] agent-run event without runId");
      return { status: "skipped", reason: "missing runId" };
    }

    const result = await step.run("execute-hook-agent", async () => {
      return runHookAgent(runId);
    });

    logger.info(`[hooks] run ${runId}: ${result.status}`, result.reason ?? "");
    return result;
  },
);
