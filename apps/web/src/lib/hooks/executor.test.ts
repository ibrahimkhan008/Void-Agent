import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * pgDb stub: dispatches by drizzle table name. Tests populate `rows` per
 * table; `claimReturn` is what the conditional queued→running UPDATE returns.
 */
const rows: Record<string, unknown[]> = {};
let claimReturn: unknown[] = [];

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table as never);
        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => (rows[name] ?? []) as never,
            }),
            limit: async () => (rows[name] ?? []) as never,
          }),
          limit: async () => (rows[name] ?? []) as never,
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => (claimReturn ?? []) as never,
        }),
      }),
    }),
  },
}));

const evaluateMatchRules = vi.fn((..._args: unknown[]) => ({ matched: true }));
const finishHookRunMock = vi.fn(async (..._args: unknown[]) => ({
  status: "succeeded",
}));
let countHookRunsTodayValue = 0;
const countHookRunsToday = vi.fn(
  async (..._args: unknown[]) => countHookRunsTodayValue,
);
let lastHookRunAtValue: Date | null = null;
const lastHookRunAt = vi.fn(async (..._args: unknown[]) => lastHookRunAtValue);
const parseHookConfig = vi.fn((raw: unknown) => {
  const config = (raw ?? {}) as {
    promptTemplate?: string;
    cooldownSeconds?: number;
    maxRunsPerDay?: number;
  };
  return {
    promptTemplate: config.promptTemplate,
    cooldownSeconds: config.cooldownSeconds ?? 60,
    maxRunsPerDay: config.maxRunsPerDay ?? 20,
  };
});
vi.mock("@/lib/db/pg/repositories/hook-repository.pg", () => ({
  getHookRunById: async () => RUN,
  evaluateMatchRules: (...args: unknown[]) => evaluateMatchRules(...args),
  finishHookRun: (...args: unknown[]) => finishHookRunMock(...args),
  countHookRunsToday: (...args: unknown[]) => countHookRunsToday(...args),
  lastHookRunAt: (...args: unknown[]) => lastHookRunAt(...args),
  parseHookConfig: (...args: Parameters<typeof parseHookConfig>) =>
    parseHookConfig(...args),
}));

const executeAgentRun = vi.fn();
vi.mock("@/lib/scheduled-tasks/runner", () => ({
  executeAgentRun: (...args: unknown[]) => executeAgentRun(...args),
}));
const createNotifications = vi.fn();
vi.mock("@/lib/notifications/create-notifications", () => ({
  createNotifications: (...args: unknown[]) => createNotifications(...args),
}));

const RUN = {
  id: "run-1",
  eventId: "evt-1",
  inboundEndpointId: "e1",
  agentId: "a1",
  userId: "u1",
  status: "queued",
  threadId: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date(),
};

import { renderHookPrompt, runHookAgent } from "./executor";

beforeEach(() => {
  claimReturn = [];
  for (const key of Object.keys(rows)) delete rows[key];
  finishHookRunMock.mockReset();
  countHookRunsTodayValue = 0;
  lastHookRunAtValue = null;
  executeAgentRun.mockReset();
  createNotifications.mockReset();
  evaluateMatchRules.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("renderHookPrompt", () => {
  it("renders the default prompt with event context", () => {
    const prompt = renderHookPrompt(undefined, {
      normalized: {
        kind: "email",
        from: "user@example.com",
        subject: "Invoice",
        text: "Please pay",
      },
    });
    expect(prompt).toContain("inbound email event");
    expect(prompt).toContain("user@example.com");
    expect(prompt).toContain("Invoice");
    expect(prompt).toContain("Please pay");
  });

  it("honors a user template with tokens", () => {
    const prompt = renderHookPrompt(
      "Process {{kind}} from {{from}}: {{text}}",
      { normalized: { kind: "webhook", from: "ci", text: "build green" } },
    );
    expect(prompt).toContain("Process webhook from ci: build green");
    expect(prompt).not.toContain("{{kind}}");
  });

  it("reads the normalized source and subject from event metadata", () => {
    const prompt = renderHookPrompt("{{kind}}: {{subject}}", {
      normalized: { source: "email", meta: { subject: "Invoice 42" } },
    });
    expect(prompt).toContain("email: Invoice 42");
  });

  it("caps oversized payloads", () => {
    const prompt = renderHookPrompt(undefined, {
      normalized: { kind: "webhook", text: "x".repeat(60_000) },
    });
    expect(prompt.length).toBeLessThan(26_000);
    expect(prompt).toContain("truncated");
  });
});

describe("runHookAgent gates", () => {
  it("skips a run claimed by another driver", async () => {
    claimReturn = [];
    const result = await runHookAgent("run-x");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("another driver");
  });

  it("skips when the endpoint is disabled", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [{ id: "e1", enabled: false, hookConfig: {} }];
    rows.hook_run = [RUN];
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("disabled");
    expect(finishHookRunMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "skipped" }),
    );
  });

  it("skips inside the cooldown window", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", enabled: true, hookConfig: { cooldownSeconds: 300 } },
    ];
    rows.hook_run = [RUN];
    lastHookRunAtValue = new Date();
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("cooldown");
    expect(executeAgentRun).not.toHaveBeenCalled();
  });

  it("skips at the daily cap", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", enabled: true, hookConfig: { maxRunsPerDay: 3 } },
    ];
    rows.hook_run = [RUN];
    countHookRunsTodayValue = 3;
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("daily cap");
    expect(executeAgentRun).not.toHaveBeenCalled();
  });

  it("fails with a notification when the agent is missing", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", userId: "u1", enabled: true, hookConfig: {} },
    ];
    rows.hook_run = [RUN];
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("agent not found");
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hook_run_failure" }),
    );
  });

  it("executes successfully and records the thread", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", userId: "u1", enabled: true, hookConfig: {} },
    ];
    rows.hook_run = [RUN];
    rows.agent = [
      {
        id: "a1",
        userId: "u1",
        name: "Hook Agent",
        description: null,
        icon: null,
        model: null,
        organizationId: null,
      },
    ];
    rows.webhook_event_outbox = [
      {
        payload: {
          normalized: {
            source: "webhook",
            text: "deploy the site",
            meta: { subject: "Release" },
          },
        },
      },
    ];
    executeAgentRun.mockResolvedValue({
      success: true,
      threadId: "thread-1",
    });
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("succeeded");
    expect(executeAgentRun).toHaveBeenCalledTimes(1);
    expect(evaluateMatchRules).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        source: "webhook",
        text: "deploy the site",
        meta: { subject: "Release" },
      }),
    );
    const [task] = executeAgentRun.mock.calls[0];
    expect(task.inputPrompt).toContain("deploy the site");
    expect(task.userId).toBe("u1");
    expect(finishHookRunMock).toHaveBeenLastCalledWith(
      "run-1",
      expect.objectContaining({ status: "succeeded", threadId: "thread-1" }),
    );
  });

  it("skips a hook whose agent is owned by another user", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", userId: "u1", enabled: true, hookConfig: {} },
    ];
    rows.hook_run = [RUN];
    rows.agent = [{ id: "a1", userId: "u2", name: "Other user agent" }];
    rows.webhook_event_outbox = [{ payload: { normalized: { text: "run" } } }];
    const result = await runHookAgent("run-1");
    expect(result).toEqual({
      status: "skipped",
      reason: "hook agent ownership changed",
    });
    expect(executeAgentRun).not.toHaveBeenCalled();
  });

  it("fails and notifies when the agent run fails", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", userId: "u1", enabled: true, hookConfig: {} },
    ];
    rows.hook_run = [RUN];
    rows.agent = [
      {
        id: "a1",
        userId: "u1",
        name: "Hook Agent",
        description: null,
        icon: null,
        model: null,
        organizationId: null,
      },
    ];
    rows.webhook_event_outbox = [
      { payload: { normalized: { kind: "webhook", text: "x" } } },
    ];
    executeAgentRun.mockResolvedValue({
      success: false,
      error: "model unavailable",
      threadId: null,
    });
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("model unavailable");
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hook_run_failure" }),
    );
  });
});
