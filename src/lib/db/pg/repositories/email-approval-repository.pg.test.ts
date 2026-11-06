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

import { hashEmailApprovalPayload, hashEmailApprovalToken } from "lib/ai/tools/hitl/email-approval";
import { emailApprovalRepository } from "./email-approval-repository.pg";

const payload = { action: "send" as const, to: "person@example.com", subject: "Update", body: "Approved text" };

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

describe("emailApprovalRepository", () => {
  it("stores only a token digest, the exact payload digest, and a bounded expiry", async () => {
    const token = await emailApprovalRepository.issue("owner-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`email-effect-approval:owner-1:${hashEmailApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashEmailApprovalPayload(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(stored.expiresAt.getTime()).toBeLessThan(Date.now() + 11 * 60_000);
  });

  it("atomically deletes a matching approval so a replay cannot consume it twice", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "consumed" }]).mockResolvedValueOnce([]);
    const token = "one-time-bearer-token";
    expect(await emailApprovalRepository.consume("owner-1", token, payload)).toBe(true);
    expect(await emailApprovalRepository.consume("owner-1", token, payload)).toBe(false);
    expect(mocks.returning).toHaveBeenCalledTimes(2);
    const sql = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(sql.params).toContain(`email-effect-approval:owner-1:${hashEmailApprovalToken(token)}`);
    expect(sql.params).toContain(hashEmailApprovalPayload(payload));
    expect(sql.params).not.toContain(token);
  });
});
