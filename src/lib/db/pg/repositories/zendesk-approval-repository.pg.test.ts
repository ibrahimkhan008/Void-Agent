import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(),
  predicates: [] as unknown[], inserted: [] as unknown[],
}));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashZendeskApprovalToken, hashZendeskCommentApproval } from "lib/ai/tools/hitl/zendesk-approval";
import { zendeskApprovalRepository } from "./zendesk-approval-repository.pg";

const payload = { ticketId: "123", comment: "Approved comment" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("zendeskApprovalRepository", () => {
  it("stores only token and payload digests with a short expiry", async () => {
    const token = await zendeskApprovalRepository.issue("owner-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`zendesk-comment-approval:owner-1:${hashZendeskApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashZendeskCommentApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("atomically consumes the exact user-scoped approval at most once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "consumed" }]).mockResolvedValueOnce([]);
    const token = "opaque-zendesk-token";
    expect(await zendeskApprovalRepository.consume("owner-1", token, payload)).toBe(true);
    expect(await zendeskApprovalRepository.consume("owner-1", token, payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`zendesk-comment-approval:owner-1:${hashZendeskApprovalToken(token)}`);
    expect(query.params).toContain(hashZendeskCommentApproval(payload));
    expect(query.params).not.toContain(token);
  });
});
