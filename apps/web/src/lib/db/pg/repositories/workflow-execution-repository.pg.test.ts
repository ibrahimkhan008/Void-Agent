import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  select: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  selectedRows: [] as unknown[],
  sets: [] as unknown[],
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({
  pgDb: { update: mocks.update, select: mocks.select },
}));

import { decrypt, encrypt } from "lib/security/encryption";
import {
  hashWorkflowExecutionEffect,
  workflowExecutionRepository,
} from "./workflow-execution-repository.pg";

const previousEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const testEncryptionKey = "0123456789abcdef0123456789abcdef";
afterAll(() => {
  if (previousEncryptionKey === undefined)
    delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = previousEncryptionKey;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sets.length = 0;
  mocks.predicates.length = 0;
  mocks.selectedRows = [];
  process.env.ENCRYPTION_MASTER_KEY = testEncryptionKey;
  mocks.set.mockImplementation((value: unknown) => {
    mocks.sets.push(value);
    return { where: mocks.where };
  });
  mocks.where.mockImplementation((predicate: unknown) => {
    mocks.predicates.push(predicate);
    return {
      returning: mocks.returning,
      limit: mocks.limit,
      orderBy: mocks.orderBy,
    };
  });
  mocks.orderBy.mockImplementation(() => ({ limit: mocks.limit }));
  mocks.limit.mockImplementation(() => Promise.resolve(mocks.selectedRows));
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.select.mockReturnValue({
    from: () => ({
      where: mocks.where,
    }),
  });
});

const effect = {
  nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
  kind: "http" as const,
  target: "https://example.test/action",
  payload: { body: { z: 2, a: 1 } },
};

describe("workflow execution repository", () => {
  it("lists recent executions for one owner with a bounded result count", async () => {
    mocks.selectedRows = [{ id: "run-1", workflowName: "Demo" }];
    const rows = await workflowExecutionRepository.listRecentForUser(
      "user-1",
      500,
    );
    expect(rows).toEqual(mocks.selectedRows);
    expect(mocks.orderBy).toHaveBeenCalledOnce();
    expect(mocks.limit).toHaveBeenCalledWith(50);
    const predicate = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(predicate.params).toContain("user-1");
    expect(predicate.sql).toContain('"workflow_execution"."user_id"');
  });

  it("reads history by both execution ID and owner without decrypting all runs", async () => {
    mocks.selectedRows = [{ id: "run-1", pendingEffect: null }];
    const row = await workflowExecutionRepository.getHistoryForUser(
      "user-1",
      "run-1",
    );
    expect(row).toEqual(mocks.selectedRows[0]);
    const predicate = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(predicate.params).toContain("user-1");
    expect(predicate.params).toContain("run-1");
  });

  it("hashes effects canonically and changes the digest when arguments change", () => {
    expect(hashWorkflowExecutionEffect(effect)).toBe(
      hashWorkflowExecutionEffect({
        ...effect,
        payload: { body: { a: 1, z: 2 } },
      }),
    );
    expect(
      hashWorkflowExecutionEffect({
        ...effect,
        payload: { body: { a: 1, z: 3 } },
      }),
    ).not.toBe(hashWorkflowExecutionEffect(effect));
  });

  it("atomically merges a node checkpoint under the owner and live-run guard", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "run-1" }]);
    const now = new Date("2026-11-08T00:00:00Z");
    const saved = await workflowExecutionRepository.checkpoint({
      userId: "user-1",
      executionId: "run-1",
      nodeId: effect.nodeId,
      checkpoint: { input: { x: 1 }, output: { y: 2 } },
      now,
    });

    expect(saved).toEqual({ id: "run-1" });
    const set = mocks.sets[0] as { progress: unknown; approvedEffect: unknown };
    expect(new PgDialect().sqlToQuery(set.progress as never).sql).toContain(
      "jsonb_set",
    );
    expect(
      new PgDialect().sqlToQuery(set.approvedEffect as never).sql,
    ).toContain("nodeId");
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.params).toContain("user-1");
    expect(query.params).toContain("running");
    expect(
      query.params.some((value) => String(value) === now.toISOString()),
    ).toBe(true);
    expect(query.sql).toContain("octet_length");
  });

  it("persists exact effect arguments and binds approval to its hash", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "run-1" }]);
    await workflowExecutionRepository.requestEffectApproval({
      userId: "user-1",
      executionId: "run-1",
      effect,
    });
    const stored = mocks.sets[0] as {
      status: string;
      pendingEffect: {
        hash: string;
        payload: Record<string, string>;
        started: boolean;
      };
    };
    expect(stored.status).toBe("awaiting_approval");
    expect(stored.pendingEffect.hash).toBe(hashWorkflowExecutionEffect(effect));
    expect(stored.pendingEffect.payload).not.toEqual(effect.payload);
    expect(
      decrypt(
        stored.pendingEffect.payload.__voidAgentEncryptedWorkflowPayloadV1,
      ),
    ).toBe(JSON.stringify(effect.payload));
    expect(stored.pendingEffect.started).toBe(false);

    mocks.returning.mockResolvedValueOnce([{ id: "run-1" }]);
    await workflowExecutionRepository.approvePendingEffect({
      userId: "user-1",
      executionId: "run-1",
      effectHash: stored.pendingEffect.hash,
    });
    const approval = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(approval.params).toContain(stored.pendingEffect.hash);
    expect(approval.params).toContain("awaiting_approval");
    expect(approval.params).toContain("user-1");
  });

  it("decrypts the pending effect only after an owner-scoped read", async () => {
    const encryptedPayload = {
      __voidAgentEncryptedWorkflowPayloadV1: encrypt(
        JSON.stringify(effect.payload),
      ),
    };
    mocks.selectedRows = [
      {
        id: "run-1",
        pendingEffect: {
          ...effect,
          payload: encryptedPayload,
          hash: hashWorkflowExecutionEffect(effect),
          started: false,
        },
        approvedEffect: null,
      },
    ];
    const row = await workflowExecutionRepository.getActiveForUser(
      "user-1",
      "run-1",
    );
    expect(row?.pendingEffect).toMatchObject({ payload: effect.payload });
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.params).toContain("user-1");
    expect(query.params).toContain("awaiting_approval");
  });

  it("permits an effect to start once and marks uncertain outcomes terminal", async () => {
    mocks.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "run-1" }]);
    const digest = hashWorkflowExecutionEffect(effect);
    expect(
      await workflowExecutionRepository.markApprovedEffectStarted({
        userId: "user-1",
        executionId: "run-1",
        effectHash: digest,
      }),
    ).toBeNull();
    const startedGuard = new PgDialect().sqlToQuery(
      mocks.predicates[0] as never,
    );
    expect(startedGuard.params).toContain(digest);
    expect(
      new PgDialect().sqlToQuery(
        (mocks.sets[0] as { approvedEffect: unknown }).approvedEffect as never,
      ).sql,
    ).toContain("jsonb_set");

    expect(
      await workflowExecutionRepository.markEffectUncertain({
        userId: "user-1",
        executionId: "run-1",
        error: "remote result lost",
      }),
    ).toEqual({ id: "run-1" });
    expect(mocks.sets[1]).toMatchObject({
      status: "effect_uncertain",
      error: "remote result lost",
    });
  });

  it("cancels only the pending effect reviewed by the same user", async () => {
    mocks.returning.mockResolvedValueOnce([]);
    const digest = hashWorkflowExecutionEffect(effect);
    expect(
      await workflowExecutionRepository.cancelPendingApproval({
        userId: "user-1",
        executionId: "run-1",
        effectHash: digest,
      }),
    ).toBeNull();
    const predicate = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(predicate.params).toContain("user-1");
    expect(predicate.params).toContain("awaiting_approval");
    expect(predicate.params).toContain(digest);
    expect(mocks.sets[0]).toMatchObject({
      status: "cancelled",
      pendingEffect: null,
      approvedEffect: null,
    });
  });
});
