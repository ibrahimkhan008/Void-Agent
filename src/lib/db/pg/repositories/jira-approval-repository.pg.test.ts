import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  insert: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
  predicates: [] as unknown[],
  inserted: [] as unknown[],
}));

vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashJiraApprovalToken, hashJiraCommentApproval } from "lib/ai/tools/hitl/jira-approval";
import { jiraApprovalRepository } from "./jira-approval-repository.pg";

const payload = { issueKey: "PROJ-123", comment: "Approved comment" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => {
    mocks.predicates.push(predicate);
    return { returning: mocks.returning };
  });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => {
    mocks.inserted.push(value);
    return Promise.resolve();
  });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("jiraApprovalRepository", () => {
  it("stores only token and payload digests with a ten-minute expiry", async () => {
    const token = await jiraApprovalRepository.issue("owner-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`jira-comment-approval:owner-1:${hashJiraApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashJiraCommentApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(stored.expiresAt.getTime()).toBeLessThan(Date.now() + 11 * 60_000);
  });

  it("atomically consumes only the exact current-user approval once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "consumed" }]).mockResolvedValueOnce([]);
    const token = "one-time-jira-token";
    expect(await jiraApprovalRepository.consume("owner-1", token, payload)).toBe(true);
    expect(await jiraApprovalRepository.consume("owner-1", token, payload)).toBe(false);
    const sql = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(sql.params).toContain(`jira-comment-approval:owner-1:${hashJiraApprovalToken(token)}`);
    expect(sql.params).toContain(hashJiraCommentApproval(payload));
    expect(sql.params).not.toContain(token);
  });
});
