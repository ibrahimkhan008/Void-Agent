import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No server-only in this module's graph BY DESIGN (see the file comment) —
// the webhook-outbox test imports it statically and must be able to mock it
// without a server boundary fight.
const createHookRun = vi.fn();
vi.mock("@/lib/db/pg/repositories/hook-repository.pg", () => ({
  createHookRun: (...args: unknown[]) => createHookRun(...args),
}));
const inngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

import { HOOK_AGENT_RUN_EVENT, dispatchInboundHook } from "./dispatch";

beforeEach(() => {
  createHookRun.mockReset();
  inngestSend.mockReset();
});

describe("dispatchInboundHook", () => {
  it("ignores payloads without an agent binding", async () => {
    const dispatch = await dispatchInboundHook({
      eventId: "evt-2",
      payload: { userId: "u1", endpointId: "e1" },
    });
    expect(dispatch.dispatched).toBe(false);
    expect(dispatch.runId).toBeNull();
    expect(createHookRun).not.toHaveBeenCalled();
  });

  it("does not re-dispatch an event that already has a run", async () => {
    createHookRun.mockResolvedValue({
      created: false,
      runId: "existing",
      run: { id: "existing" },
    });
    let enqueued = 0;
    const dispatch = await dispatchInboundHook({
      eventId: "evt-1",
      payload: { agentId: "a1", userId: "u1", endpointId: "e1" },
      enqueue: async () => {
        enqueued += 1;
      },
    });
    expect(dispatch.dispatched).toBe(false);
    expect(enqueued).toBe(0);
  });

  it("dispatches a fresh event and enqueues the run", async () => {
    createHookRun.mockResolvedValue({
      created: true,
      runId: "run-new",
      run: { id: "run-new" },
    });
    let enqueued: { runId: string } | null = null;
    const dispatch = await dispatchInboundHook({
      eventId: "evt-new",
      payload: { agentId: "a1", userId: "u1", endpointId: "e1" },
      enqueue: async (data) => {
        enqueued = data;
      },
    });
    expect(dispatch.dispatched).toBe(true);
    expect(dispatch.runId).toBe("run-new");
    expect(enqueued).toEqual({ runId: "run-new" });
  });

  it("exposes the agent-run event name used by the Inngest consumer", () => {
    expect(HOOK_AGENT_RUN_EVENT).toBe("void/hooks.agent-run");
  });
});
