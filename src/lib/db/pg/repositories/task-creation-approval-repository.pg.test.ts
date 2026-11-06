import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(), predicates: [] as unknown[], inserted: [] as unknown[] }));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashTaskApprovalToken, hashTaskCreationApproval } from "lib/ai/tools/hitl/task-creation-approval";
import { taskCreationApprovalRepository } from "./task-creation-approval-repository.pg";

const payload = { provider: "clickup" as const, targetId: "77", name: "Ship", details: "Release" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.predicates.length = 0; mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("taskCreationApprovalRepository", () => {
  it("stores only hashes and sets a short expiry", async () => {
    const token = await taskCreationApprovalRepository.issue("user-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`task-creation-approval:user-1:${hashTaskApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashTaskCreationApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("consumes the exact user-scoped token only once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "used" }]).mockResolvedValueOnce([]);
    const token = "opaque-task-token";
    expect(await taskCreationApprovalRepository.consume("user-1", token, payload)).toBe(true);
    expect(await taskCreationApprovalRepository.consume("user-1", token, payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`task-creation-approval:user-1:${hashTaskApprovalToken(token)}`);
    expect(query.params).toContain(hashTaskCreationApproval(payload));
  });
});
