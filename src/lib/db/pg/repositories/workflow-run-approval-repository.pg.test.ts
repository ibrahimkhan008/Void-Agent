import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(), predicates: [] as unknown[], inserted: [] as unknown[] }));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashWorkflowApprovalToken, hashWorkflowRunApproval } from "lib/ai/tools/hitl/workflow-run-approval";
import { workflowRunApprovalRepository } from "./workflow-run-approval-repository.pg";

const payload = { platform: "activepieces" as const, target: "flow-123", payload: { userId: "42", active: true } };

beforeEach(() => {
  vi.clearAllMocks(); mocks.predicates.length = 0; mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("workflowRunApprovalRepository", () => {
  it("stores a user-scoped token digest and payload digest only", async () => {
    const token = await workflowRunApprovalRepository.issue("user-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`workflow-run-approval:user-1:${hashWorkflowApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashWorkflowRunApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("consumes only the exact user-scoped approval once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "used" }]).mockResolvedValueOnce([]);
    expect(await workflowRunApprovalRepository.consume("user-1", "opaque-workflow-token", payload)).toBe(true);
    expect(await workflowRunApprovalRepository.consume("user-1", "opaque-workflow-token", payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`workflow-run-approval:user-1:${hashWorkflowApprovalToken("opaque-workflow-token")}`);
    expect(query.params).toContain(hashWorkflowRunApproval(payload));
  });

  it("does not consume an approval when the input payload has changed", async () => {
    mocks.returning.mockResolvedValueOnce([]);
    const changedPayload = { ...payload, payload: { ...payload.payload, userId: "attacker" } };
    expect(await workflowRunApprovalRepository.consume("user-1", "opaque-workflow-token", changedPayload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.params).toContain(hashWorkflowRunApproval(changedPayload));
    expect(query.params).not.toContain(hashWorkflowRunApproval(payload));
  });
});
