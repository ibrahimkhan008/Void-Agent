import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  endpoints: [] as Array<{
    id: string;
    agentId: string;
    hookConfig: { eventTypes?: unknown } | null;
  }>,
  failQuery: false,
  enqueue: vi.fn<
    (...args: unknown[]) => Promise<{ id: string; duplicate: boolean }>
  >(async (..._args: unknown[]) => ({ id: "outbox-1", duplicate: false })),
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (state.failQuery) throw new Error("database unavailable");
          return state.endpoints;
        },
      }),
    }),
  },
}));
vi.mock("@/lib/db/pg/repositories/webhook-repository.pg", () => ({
  webhookRepository: {
    enqueueOutboxEvent: (...args: unknown[]) => state.enqueue(...args),
  },
}));
vi.mock("logger", () => ({
  default: { warn: (...args: unknown[]) => state.warn(...args) },
}));

import {
  internalHookEventId,
  publishInternalHookEvent,
} from "./internal-events";

beforeEach(() => {
  state.endpoints = [];
  state.failQuery = false;
  state.enqueue.mockReset();
  state.enqueue.mockResolvedValue({ id: "outbox-1", duplicate: false });
  state.warn.mockReset();
});

describe("internal hook events", () => {
  it("uses a deterministic, endpoint-scoped outbox id", () => {
    const input = {
      userId: "owner-1",
      eventType: "project.created" as const,
      sourceId: "project-1",
      endpointId: "endpoint-1",
    };
    expect(internalHookEventId(input)).toBe(internalHookEventId(input));
    expect(internalHookEventId(input)).not.toBe(
      internalHookEventId({ ...input, endpointId: "endpoint-2" }),
    );
  });

  it("only enqueues subscribed owner event hooks and bounds payload text", async () => {
    state.endpoints = [
      {
        id: "endpoint-1",
        agentId: "agent-1",
        hookConfig: { eventTypes: ["project.created"] },
      },
      {
        id: "endpoint-2",
        agentId: "agent-2",
        hookConfig: { eventTypes: ["project.deleted"] },
      },
    ];
    const text = "x".repeat(9_000);

    const count = await publishInternalHookEvent({
      userId: "owner-1",
      eventType: "project.created",
      sourceId: "project-1",
      text,
      meta: { projectId: "project-1" },
    });

    expect(count).toBe(1);
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "internal.project.created",
        payload: expect.objectContaining({
          agentId: "agent-1",
          normalized: expect.objectContaining({ text: "x".repeat(8_000) }),
        }),
      }),
    );
  });

  it("keeps a committed source mutation successful when event lookup fails", async () => {
    state.failQuery = true;

    await expect(
      publishInternalHookEvent({
        userId: "owner-1",
        eventType: "memory.record.updated",
        sourceId: "MEMORY:2",
        text: "Memory record changed",
      }),
    ).resolves.toBe(0);
    expect(state.warn).toHaveBeenCalledOnce();
  });
});
