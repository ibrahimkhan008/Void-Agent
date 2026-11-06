import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(), predicates: [] as unknown[], inserted: [] as unknown[] }));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashFreshdeskApprovalToken, hashFreshdeskEffectApproval } from "lib/ai/tools/hitl/freshdesk-approval";
import { freshdeskApprovalRepository } from "./freshdesk-approval-repository.pg";

const payload = { action: "add_reply" as const, ticketId: "123", body: "Reviewed" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.predicates.length = 0; mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("freshdeskApprovalRepository", () => {
  it("stores only digests with a short expiry", async () => {
    const token = await freshdeskApprovalRepository.issue("owner-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`freshdesk-effect-approval:owner-1:${hashFreshdeskApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashFreshdeskEffectApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("atomically consumes exact owner-bound tokens at most once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "consumed" }]).mockResolvedValueOnce([]);
    const token = "opaque-freshdesk-token";
    expect(await freshdeskApprovalRepository.consume("owner-1", token, payload)).toBe(true);
    expect(await freshdeskApprovalRepository.consume("owner-1", token, payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`freshdesk-effect-approval:owner-1:${hashFreshdeskApprovalToken(token)}`);
    expect(query.params).toContain(hashFreshdeskEffectApproval(payload));
    expect(query.params).not.toContain(token);
  });
});
