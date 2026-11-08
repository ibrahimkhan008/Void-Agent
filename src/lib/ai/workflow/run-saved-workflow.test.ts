import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execution: null as any,
  effectRuns: 0,
  failEffect: false,
  create: vi.fn(),
  getForUser: vi.fn(),
  requestEffectApproval: vi.fn(),
  markApprovedEffectStarted: vi.fn(),
  markEffectUncertain: vi.fn(),
  checkpoint: vi.fn(),
  finish: vi.fn(),
  selectExecuteAbility: vi.fn(),
  selectStructureById: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/repositories/workflow-execution-repository.pg", () => ({
  hashWorkflowExecutionEffect: () => "a".repeat(64),
  workflowExecutionRepository: {
    create: (...args: unknown[]) => mocks.create(...args),
    getForUser: (...args: unknown[]) => mocks.getForUser(...args),
    requestEffectApproval: (...args: unknown[]) =>
      mocks.requestEffectApproval(...args),
    markApprovedEffectStarted: (...args: unknown[]) =>
      mocks.markApprovedEffectStarted(...args),
    markEffectUncertain: (...args: unknown[]) =>
      mocks.markEffectUncertain(...args),
    checkpoint: (...args: unknown[]) => mocks.checkpoint(...args),
    finish: (...args: unknown[]) => mocks.finish(...args),
  },
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectExecuteAbility: (...args: unknown[]) =>
      mocks.selectExecuteAbility(...args),
    selectStructureById: (...args: unknown[]) =>
      mocks.selectStructureById(...args),
  },
}));
vi.mock("./assert-workflow-mcp-access", () => ({
  assertWorkflowMcpAccess: vi.fn(),
}));
vi.mock("./workflow-review", () => ({
  getWorkflowGraphRevision: () => "b".repeat(64),
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: (options: any) => ({
    subscribe: vi.fn(),
    exit: vi.fn(),
    run: async () => {
      try {
        await options.execution.beforeEffect({
          nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
          kind: "http",
          target: "https://example.test/action?token=private",
          payload: {
            headers: { Authorization: "Bearer private" },
            body: { ok: true },
          },
        });
        mocks.effectRuns += 1;
        if (mocks.failEffect) throw new Error("connection dropped");
        await options.execution.onNodeCheckpoint(
          "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
          { input: {}, output: { delivered: true } },
        );
        return { isOk: true };
      } catch (error) {
        return { isOk: false, error };
      }
    },
  }),
}));

import { WorkflowExecutionInputSchema } from "./execution-state";
import {
  resumeApprovedWorkflowExecution,
  startSavedWorkflowExecution,
  toWorkflowEffectReview,
} from "./run-saved-workflow";

const workflow = {
  id: "workflow-1",
  name: "Demo",
  isPublished: true,
  icon: undefined,
  nodes: [],
  edges: [],
} as any;

function setExecution(overrides: Record<string, unknown> = {}) {
  mocks.execution = {
    id: "execution-1",
    userId: "user-1",
    workflowId: workflow.id,
    workflowName: workflow.name,
    graphRevision: "b".repeat(64),
    input: { query: "do it" },
    progress: { completedNodes: {} },
    status: "running",
    pendingEffect: null,
    approvedEffect: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effectRuns = 0;
  mocks.failEffect = false;
  setExecution();
  mocks.create.mockImplementation(async (value: Record<string, unknown>) => {
    mocks.execution = { ...mocks.execution, ...value };
    return mocks.execution;
  });
  mocks.getForUser.mockImplementation(async () => mocks.execution);
  mocks.requestEffectApproval.mockImplementation(async (input: any) => {
    mocks.execution = {
      ...mocks.execution,
      status: "awaiting_approval",
      pendingEffect: { ...input.effect, hash: "a".repeat(64), started: false },
    };
    return mocks.execution;
  });
  mocks.markApprovedEffectStarted.mockImplementation(async () => {
    mocks.execution = {
      ...mocks.execution,
      approvedEffect: { ...mocks.execution.approvedEffect, started: true },
    };
    return mocks.execution;
  });
  mocks.markEffectUncertain.mockImplementation(async () => {
    mocks.execution = { ...mocks.execution, status: "effect_uncertain" };
    return mocks.execution;
  });
  mocks.checkpoint.mockImplementation(async (input: any) => {
    mocks.execution = {
      ...mocks.execution,
      progress: {
        completedNodes: {
          ...mocks.execution.progress.completedNodes,
          [input.nodeId]: input.checkpoint,
        },
      },
      approvedEffect: null,
    };
    return mocks.execution;
  });
  mocks.finish.mockImplementation(async (input: any) => {
    mocks.execution = { ...mocks.execution, status: input.status };
    return mocks.execution;
  });
  mocks.selectExecuteAbility.mockResolvedValue([
    { id: workflow.id, name: workflow.name },
  ]);
  mocks.selectStructureById.mockResolvedValue(workflow);
});

describe("saved workflow durable execution", () => {
  it("returns a redacted review of the exact pending effect", () => {
    const review = toWorkflowEffectReview({
      nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
      kind: "http",
      target:
        "https://user:pass@example.test/action?token=private&ok=1#fragment",
      payload: {
        headers: {
          Authorization: "secret",
          "Content-Type": "application/json",
        },
        body: "safe",
      },
      hash: "a".repeat(64),
      started: false,
    });
    expect(review.target).toBe(
      "https://example.test/action?token=%5Bredacted%5D&ok=1",
    );
    expect(review.payload).toMatchObject({
      headers: {
        Authorization: "[redacted]",
        "Content-Type": "application/json",
      },
    });
    expect(review.hash).toBe("a".repeat(64));
  });

  it("pauses before an external effect and resumes once after approval", async () => {
    const started = await startSavedWorkflowExecution({
      userId: "user-1",
      workflow,
      workflowName: workflow.name,
      executionInput: WorkflowExecutionInputSchema.parse({ query: "do it" }),
    });
    expect(started.status).toBe("awaiting_approval");
    expect(mocks.effectRuns).toBe(0);
    expect(mocks.execution.status).toBe("awaiting_approval");
    expect((started as any).pendingEffect.hash).toBe("a".repeat(64));

    mocks.execution = {
      ...mocks.execution,
      status: "running",
      approvedEffect: mocks.execution.pendingEffect,
      pendingEffect: null,
    };
    const resumed = await resumeApprovedWorkflowExecution({
      userId: "user-1",
      executionId: "execution-1",
    });
    expect(resumed.status).toBe("success");
    expect(mocks.effectRuns).toBe(1);
    expect(mocks.execution.status).toBe("completed");
  });

  it("marks an interrupted started effect uncertain and never retries it", async () => {
    mocks.failEffect = true;
    mocks.execution = {
      ...mocks.execution,
      approvedEffect: {
        nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
        kind: "http",
        target: "https://example.test/action?token=private",
        payload: {
          headers: { Authorization: "Bearer private" },
          body: { ok: true },
        },
        hash: "a".repeat(64),
        started: false,
      },
    };

    const result = await resumeApprovedWorkflowExecution({
      userId: "user-1",
      executionId: "execution-1",
    });

    expect(result.status).toBe("effect_uncertain");
    expect(mocks.effectRuns).toBe(1);
    expect(mocks.execution.status).toBe("effect_uncertain");
    await expect(
      resumeApprovedWorkflowExecution({
        userId: "user-1",
        executionId: "execution-1",
      }),
    ).rejects.toThrow(/cannot safely retry/i);
    expect(mocks.effectRuns).toBe(1);
  });
});
