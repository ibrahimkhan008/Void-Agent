import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimPendingOutboxEvents: vi.fn(),
  markOutboxEventDelivered: vi.fn(),
  dispatchInboundHook: vi.fn(),
  runHookAgent: vi.fn(),
  listQueuedHookRuns: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mocks.send },
}));

vi.mock("lib/db/repository", () => ({
  webhookRepository: {
    claimPendingOutboxEvents: mocks.claimPendingOutboxEvents,
    markOutboxEventDelivered: mocks.markOutboxEventDelivered,
  },
}));

vi.mock("lib/hooks/dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/hooks/dispatch")>()),
  dispatchInboundHook: mocks.dispatchInboundHook,
}));

vi.mock("lib/hooks/executor", () => ({
  runHookAgent: mocks.runHookAgent,
}));

vi.mock("@/lib/db/pg/repositories/hook-repository.pg", () => ({
  listQueuedHookRuns: mocks.listQueuedHookRuns,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCHEDULED_TASK_SECRET = "tick-secret";
  mocks.send.mockResolvedValue({ ids: [] });
  mocks.markOutboxEventDelivered.mockResolvedValue(undefined);
  mocks.runHookAgent.mockResolvedValue({ status: "succeeded" });
  mocks.listQueuedHookRuns.mockResolvedValue([]);
  mocks.dispatchInboundHook.mockResolvedValue({
    dispatched: true,
    runId: "run-d1",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const tickRequest = (auth = "tick-secret") =>
  new Request("https://void.test/api/hooks/tick", {
    method: "POST",
    headers: { "X-Scheduled-Task-Auth": auth },
  });

const inboundEvent = (id: string) => ({
  id,
  kind: "inbound",
  eventType: "inbound.received",
  payload: { userId: "u1", endpointId: "ep-1", agentId: "a1" },
});

describe("POST /api/hooks/tick", () => {
  it("returns 503 when SCHEDULED_TASK_SECRET is unset", async () => {
    delete process.env.SCHEDULED_TASK_SECRET;
    const response = await POST(tickRequest());
    expect(response.status).toBe(503);
  });

  it("returns 401 on a wrong secret", async () => {
    const response = await POST(tickRequest("wrong"));
    expect(response.status).toBe(401);
    expect(mocks.claimPendingOutboxEvents).not.toHaveBeenCalled();
  });

  it("claims inbound events, dispatches, retires them and runs inline", async () => {
    mocks.claimPendingOutboxEvents.mockResolvedValue([
      inboundEvent("evt-1"),
      { id: "evt-2", kind: "outbound", payload: { userId: "u1" } },
      { id: "evt-3", kind: "inbound", payload: { userId: "u1" } },
    ]);
    const response = await POST(tickRequest());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      claimed: number;
      inbound: number;
      dispatched: string[];
      results: Array<{ runId: string; status: string }>;
    };
    expect(payload.claimed).toBe(3);
    // The inbound count is agent-bound events only.
    expect(payload.inbound).toBe(1);
    // Only the agent-bound inbound event is dispatched; the agent-less one
    // is retired without a run.
    expect(payload.dispatched).toEqual(["run-d1"]);
    expect(mocks.markOutboxEventDelivered).toHaveBeenCalledTimes(2);
    expect(mocks.runHookAgent).toHaveBeenCalledWith("run-d1");
    expect(payload.results).toEqual([{ runId: "run-d1", status: "succeeded" }]);
  });

  it("re-enqueues dispatched runs the backlog budget pushed out", async () => {
    // Three queued backlog runs fill the inline budget of three; the newly
    // dispatched run cannot execute inline and must be handed to Inngest —
    // not left only to the next tick's backlog scan.
    mocks.listQueuedHookRuns.mockResolvedValue([
      { id: "backlog-1" },
      { id: "backlog-2" },
      { id: "backlog-3" },
    ]);
    const response = await POST(tickRequest());
    const payload = (await response.json()) as {
      results: Array<{ runId: string }>;
    };
    expect(payload.results.map((result) => result.runId)).toEqual([
      "backlog-1",
      "backlog-2",
      "backlog-3",
    ]);
    expect(mocks.runHookAgent).toHaveBeenCalledTimes(3);
    expect(mocks.send).toHaveBeenCalledWith({
      name: "void/hooks.agent-run",
      data: { runId: "run-d1" },
    });
  });

  it("does not re-enqueue dispatched runs that executed inline", async () => {
    mocks.claimPendingOutboxEvents.mockResolvedValue([inboundEvent("evt-1")]);
    const response = await POST(tickRequest());
    const payload = (await response.json()) as {
      results: Array<{ runId: string }>;
    };
    expect(payload.results.map((result) => result.runId)).toEqual(["run-d1"]);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
