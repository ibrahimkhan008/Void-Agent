import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createHookRunMock,
  inngestSendMock,
  connectorApiMock,
  resolveEffectiveMock,
  executeHookScriptMock,
} = vi.hoisted(() => ({
  createHookRunMock: vi.fn(),
  inngestSendMock: vi.fn(),
  connectorApiMock: vi.fn(),
  resolveEffectiveMock: vi.fn(),
  executeHookScriptMock: vi.fn(),
}));

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
    chainOnSuccess?: string[];
    script?: {
      language: "javascript" | "typescript" | "python";
      source: string;
    };
  };
  return {
    promptTemplate: config.promptTemplate,
    cooldownSeconds: config.cooldownSeconds ?? 60,
    maxRunsPerDay: config.maxRunsPerDay ?? 20,
    chainOnSuccess: config.chainOnSuccess ?? [],
    script: config.script,
  };
});
vi.mock("@/lib/db/pg/repositories/hook-repository.pg", () => ({
  createHookRun: (...args: unknown[]) => createHookRunMock(...args),
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
vi.mock("./script-executor", () => ({
  executeHookScript: (...args: unknown[]) => executeHookScriptMock(...args),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));
const createNotifications = vi.fn();
vi.mock("@/lib/notifications/create-notifications", () => ({
  createNotifications: (...args: unknown[]) => createNotifications(...args),
}));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: (...args: unknown[]) => connectorApiMock(...args),
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock("@/lib/db/pg/repositories/code-review-repository.pg", () => ({
  codeReviewRepository: {
    resolveEffective: (...args: unknown[]) => resolveEffectiveMock(...args),
    getRepoSetting: vi.fn(async () => null),
    getUserPrefs: vi.fn(async () => ({
      userId: "u1",
      reviewTrigger: "pr_open",
      exhaustiveReview: false,
      updatedAt: new Date(),
    })),
  },
}));

const RUN = {
  id: "run-1",
  eventId: "evt-1",
  inboundEndpointId: "e1",
  agentId: "a1",
  userId: "u1",
  status: "queued",
  threadId: null,
  triggerPayload: null,
  chainDepth: 0,
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
  executeHookScriptMock.mockReset();
  createNotifications.mockReset();
  connectorApiMock.mockReset();
  resolveEffectiveMock.mockReset();
  evaluateMatchRules.mockClear();
  createHookRunMock.mockReset();
  createHookRunMock.mockResolvedValue({ created: true, runId: "child-run" });
  inngestSendMock.mockReset();
  inngestSendMock.mockResolvedValue({});
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

  it("excludes its own queued row from the daily-cap count", async () => {
    // The run's row is created before the check; counting it would block
    // the endpoint's first execution of the day when maxRunsPerDay is 1
    // (caught live by the pipeline integration test).
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      { id: "e1", enabled: true, hookConfig: { maxRunsPerDay: 5 } },
    ];
    rows.hook_run = [RUN];
    countHookRunsTodayValue = 0;
    await runHookAgent("run-1");
    expect(countHookRunsToday).toHaveBeenCalledWith("e1", "run-1");
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

  it("runs a configured user script before the agent and passes its output", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      {
        id: "e1",
        userId: "u1",
        enabled: true,
        hookConfig: {
          script: {
            language: "javascript",
            source: "console.log(payload.text)",
          },
        },
      },
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
      { payload: { normalized: { source: "webhook", text: "hello" } } },
    ];
    executeHookScriptMock.mockResolvedValue({
      success: true,
      output: "transformed event",
      executionTimeMs: 20,
    });
    executeAgentRun.mockResolvedValue({
      success: true,
      threadId: "thread-script",
    });

    const result = await runHookAgent("run-1");

    expect(result.status).toBe("succeeded");
    expect(executeHookScriptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        script: { language: "javascript", source: "console.log(payload.text)" },
        userId: "u1",
      }),
    );
    expect(executeAgentRun.mock.calls[0][0].inputPrompt).toContain(
      "transformed event",
    );
  });

  it("fails the hook and does not invoke the agent when the script fails", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [
      {
        id: "e1",
        userId: "u1",
        enabled: true,
        hookConfig: {
          script: { language: "python", source: "raise RuntimeError('no')" },
        },
      },
    ];
    rows.hook_run = [RUN];
    rows.agent = [{ id: "a1", userId: "u1", name: "Hook Agent" }];
    rows.webhook_event_outbox = [
      { payload: { normalized: { text: "hello" } } },
    ];
    executeHookScriptMock.mockResolvedValue({
      success: false,
      output: "",
      error: "runtime error",
      executionTimeMs: 10,
    });

    const result = await runHookAgent("run-1");

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("runtime error");
    expect(executeAgentRun).not.toHaveBeenCalled();
  });

  it("executes a GitHub-triggered run with repository context", async () => {
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
            source: "github",
            from: "octodev",
            text: "acme/widgets: push — refs/heads/main\nPushed d3adb33f to refs/heads/main\nFix the inventory query",
            meta: {
              repository: "acme/widgets",
              event: "push",
              action: null,
              subject: "refs/heads/main",
            },
          },
        },
      },
    ];
    executeAgentRun.mockResolvedValue({
      success: true,
      threadId: "thread-gh",
    });
    const result = await runHookAgent("run-1");
    expect(result.status).toBe("succeeded");
    expect(evaluateMatchRules).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        source: "github",
        text: expect.stringContaining("Fix the inventory query"),
        meta: expect.objectContaining({
          repository: "acme/widgets",
          event: "push",
          subject: "refs/heads/main",
        }),
      }),
    );
    const [task] = executeAgentRun.mock.calls[0];
    expect(task.inputPrompt).toContain("an inbound github event");
    expect(task.inputPrompt).toContain("From: octodev");
    expect(task.inputPrompt).toContain("Subject: refs/heads/main");
    expect(task.inputPrompt).toContain("Fix the inventory query");
    expect(finishHookRunMock).toHaveBeenLastCalledWith(
      "run-1",
      expect.objectContaining({ status: "succeeded", threadId: "thread-gh" }),
    );
  });

  it("queues owner-scoped follow-up hooks after success", async () => {
    claimReturn = [{ id: "run-1" }];
    const targetId = "00000000-0000-4000-8000-000000000002";
    rows.inbound_endpoint = [
      {
        id: "e1",
        userId: "u1",
        enabled: true,
        hookConfig: { chainOnSuccess: [targetId] },
      },
      {
        id: targetId,
        userId: "u1",
        enabled: true,
        agentId: "a2",
        hookConfig: {},
      },
    ];
    rows.hook_run = [RUN];
    rows.agent = [
      {
        id: "a1",
        userId: "u1",
        name: "Parent",
        description: null,
        icon: null,
        model: null,
        organizationId: null,
      },
      {
        id: "a2",
        userId: "u1",
        name: "Child",
        description: null,
        icon: null,
        model: null,
        organizationId: null,
      },
    ];
    rows.webhook_event_outbox = [
      { payload: { normalized: { source: "webhook", text: "start" } } },
    ];
    executeAgentRun.mockResolvedValue({ success: true, threadId: null });

    const result = await runHookAgent("run-1");

    expect(result.status).toBe("succeeded");
    expect(createHookRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `chain:run-1:${targetId}`,
        inboundEndpointId: targetId,
        agentId: "a2",
        userId: "u1",
        chainDepth: 1,
        triggerPayload: expect.objectContaining({
          normalized: expect.objectContaining({ source: "hook_chain" }),
        }),
      }),
    );
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "void/hooks.agent-run",
      data: { runId: "child-run" },
    });
  });

  it("stops hook chains after three hops", async () => {
    claimReturn = [{ id: "run-1" }];
    RUN.chainDepth = 3;
    rows.inbound_endpoint = [
      {
        id: "e1",
        userId: "u1",
        enabled: true,
        hookConfig: { chainOnSuccess: ["e2"] },
      },
    ];
    rows.hook_run = [RUN];
    rows.agent = [{ id: "a1", userId: "u1", name: "Parent" }];
    rows.webhook_event_outbox = [
      { payload: { normalized: { text: "start" } } },
    ];
    executeAgentRun.mockResolvedValue({ success: true, threadId: null });

    await runHookAgent("run-1");

    expect(createHookRunMock).not.toHaveBeenCalled();
    RUN.chainDepth = 0;
  });

  it("does not enqueue a chained hook owned by another user", async () => {
    claimReturn = [{ id: "run-1" }];
    const foreignHookId = "00000000-0000-4000-8000-000000000004";
    rows.inbound_endpoint = [
      {
        id: "e1",
        userId: "u1",
        enabled: true,
        hookConfig: { chainOnSuccess: [foreignHookId] },
      },
      {
        id: foreignHookId,
        userId: "u2",
        enabled: true,
        agentId: "a2",
        hookConfig: {},
      },
    ];
    rows.hook_run = [RUN];
    rows.agent = [{ id: "a1", userId: "u1", name: "Parent" }];
    rows.webhook_event_outbox = [
      { payload: { normalized: { text: "start" } } },
    ];
    executeAgentRun.mockResolvedValue({ success: true, threadId: null });

    await runHookAgent("run-1");

    expect(createHookRunMock).not.toHaveBeenCalled();
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

describe("runHookAgent — AI Code Review path", () => {
  const reviewEndpoint = {
    id: "e1",
    userId: "u1",
    agentId: "a1",
    enabled: true,
    hookConfig: {
      codeReview: { repository: "acme/widgets" },
      cooldownSeconds: 0,
      maxRunsPerDay: 10,
    },
  };
  const agentRow = {
    id: "a1",
    userId: "u1",
    name: "Code Reviewer",
    description: null,
    icon: null,
    model: null,
    organizationId: null,
  };
  const prPayload = {
    normalized: {
      source: "github",
      text: "acme/widgets: pull_request opened",
      meta: {
        repository: "acme/widgets",
        event: "pull_request",
        action: "opened",
        subject: "Fix inventory",
        pullNumber: 42,
      },
    },
  };

  beforeEach(() => {
    resolveEffectiveMock.mockResolvedValue({
      autoReview: true,
      reviewTrigger: "pr_open",
      exhaustiveReview: false,
      reviewInstructions: "Focus on SQL injection.",
    });
    connectorApiMock.mockImplementation(
      async (_userId: string, _provider: string, path: string) => {
        if (path.endsWith("/pulls/42")) {
          return {
            title: "Fix inventory",
            user: { login: "octodev" },
            head: { ref: "fix/inventory", sha: "abc123def456" },
            base: { ref: "main" },
            body: "Fixes the query.",
          };
        }
        if (path.endsWith("/pulls/42/files")) {
          return [
            {
              filename: "src/inventory.sql",
              additions: 4,
              deletions: 1,
              status: "modified",
              patch: "+ SELECT id FROM inventory;",
            },
          ];
        }
        if (path.endsWith("/contents/AGENTS.md")) {
          return {
            encoding: "base64",
            content: Buffer.from(
              "Always parameterize queries.",
              "utf8",
            ).toString("base64"),
          };
        }
        if (path.endsWith("/contents/SECURITY.md")) {
          throw new Error("not found");
        }
        if (path.endsWith("/pulls/42/reviews")) {
          return { id: 9_001 };
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    executeAgentRun.mockResolvedValue({
      success: true,
      threadId: "0d9c1c2a-0000-4000-8000-000000000001",
    });
  });

  it("reviews the PR and posts the summary unattended", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [reviewEndpoint];
    rows.hook_run = [RUN];
    rows.agent = [agentRow];
    rows.webhook_event_outbox = [{ payload: prPayload }];
    rows.chat_message = [
      {
        parts: [
          {
            type: "text",
            text: "Found 1 issue: unparameterized query.\nVerdict: changes requested",
          },
        ],
      },
    ];

    const result = await runHookAgent("run-1");
    expect(result.status).toBe("succeeded");

    // The prompt carried the diff, the guidance file and the owner instructions.
    const [task] = executeAgentRun.mock.calls[0];
    expect(task.inputPrompt).toContain("acme/widgets");
    expect(task.inputPrompt).toContain("PR #42: Fix inventory");
    expect(task.inputPrompt).toContain("+ SELECT id FROM inventory;");
    expect(task.inputPrompt).toContain("Always parameterize queries.");
    expect(task.inputPrompt).toContain("Focus on SQL injection.");

    // The review was posted as a COMMENT event with the thread answer.
    const reviewCall = connectorApiMock.mock.calls.find((call) =>
      String(call[2]).endsWith("/pulls/42/reviews"),
    );
    expect(reviewCall).toBeDefined();
    expect(reviewCall[3]).toMatchObject({
      method: "POST",
      body: {
        event: "COMMENT",
        body: expect.stringContaining("Verdict: changes requested"),
      },
    });
    expect(finishHookRunMock).toHaveBeenLastCalledWith(
      "run-1",
      expect.objectContaining({ status: "succeeded" }),
    );
  });

  it("skips events the trigger does not cover", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [reviewEndpoint];
    rows.hook_run = [RUN];
    rows.agent = [agentRow];
    rows.chat_message = [];
    rows.webhook_event_outbox = [
      {
        payload: {
          normalized: {
            source: "github",
            meta: {
              repository: "acme/widgets",
              event: "pull_request",
              action: "closed",
              subject: "Fix inventory",
              pullNumber: 42,
            },
          },
        },
      },
    ];

    const result = await runHookAgent("run-1");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("trigger not matched");
    expect(executeAgentRun).not.toHaveBeenCalled();
    expect(connectorApiMock).not.toHaveBeenCalled();
  });

  it("skips when code review is disabled for the repository", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [reviewEndpoint];
    rows.hook_run = [RUN];
    rows.agent = [agentRow];
    resolveEffectiveMock.mockResolvedValue({
      autoReview: false,
      reviewTrigger: "pr_open",
      exhaustiveReview: false,
      reviewInstructions: null,
    });

    const result = await runHookAgent("run-1");
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("code review disabled");
    expect(executeAgentRun).not.toHaveBeenCalled();
  });

  it("fails the run and notifies when posting the review fails", async () => {
    claimReturn = [{ id: "run-1" }];
    rows.inbound_endpoint = [reviewEndpoint];
    rows.hook_run = [RUN];
    rows.agent = [agentRow];
    rows.webhook_event_outbox = [{ payload: prPayload }];
    rows.chat_message = [
      { parts: [{ type: "text", text: "Verdict: safe to merge" }] },
    ];
    connectorApiMock.mockImplementation(
      async (_userId: string, _provider: string, path: string) => {
        if (path.endsWith("/pulls/42/reviews")) {
          throw new Error("github 502");
        }
        if (path.endsWith("/pulls/42")) {
          return {
            title: "Fix inventory",
            user: { login: "octodev" },
            head: { ref: "fix/inventory", sha: "abc123def456" },
            base: { ref: "main" },
            body: "",
          };
        }
        if (path.endsWith("/pulls/42/files")) return [];
        throw new Error(`unexpected path ${path}`);
      },
    );

    const result = await runHookAgent("run-1");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("github 502");
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hook_run_failure" }),
    );
  });
});
