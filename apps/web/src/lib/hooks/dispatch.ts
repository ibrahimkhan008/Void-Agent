import { createHookRun } from "@/lib/db/pg/repositories/hook-repository.pg";

/**
 * Void Hooks dispatch (master prompt §3.5): idempotently creates the hook_run
 * row for a claimed `inbound.received` outbox event and enqueues the async
 * agent run. Intentionally FREE of `server-only`: the webhook outbox tick
 * imports this module statically, and its test mocks the whole file — a
 * server-only boundary here would make that mock ineffective.
 *
 * Idempotency: hook_run is UNIQUE on event_id — a re-claimed event returns
 * created:false and never double-runs, no matter how many drivers race.
 */

export const HOOK_AGENT_RUN_EVENT = "void/hooks.agent-run";

export async function dispatchInboundHook(input: {
  eventId: string;
  payload: Record<string, unknown>;
  /** Enqueues the async run (Inngest). The secret-gated tick runs inline. */
  enqueue?: (data: { runId: string }) => Promise<unknown>;
}): Promise<{ dispatched: boolean; runId: string | null }> {
  const payload = (input.payload ?? {}) as {
    agentId?: unknown;
    userId?: unknown;
    endpointId?: unknown;
  };
  const agentId =
    typeof payload.agentId === "string" && payload.agentId
      ? payload.agentId
      : null;
  const userId =
    typeof payload.userId === "string" && payload.userId
      ? payload.userId
      : null;
  const endpointId =
    typeof payload.endpointId === "string" && payload.endpointId
      ? payload.endpointId
      : null;
  if (!agentId || !userId || !endpointId) {
    return { dispatched: false, runId: null };
  }

  const { created, runId } = await createHookRun({
    eventId: input.eventId,
    inboundEndpointId: endpointId,
    agentId,
    userId,
  });
  if (!created || !runId) {
    return { dispatched: false, runId };
  }
  if (input.enqueue) {
    try {
      await input.enqueue({ runId });
    } catch (error) {
      console.error(
        "[hooks] failed to enqueue run",
        runId,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { dispatched: true, runId };
}
