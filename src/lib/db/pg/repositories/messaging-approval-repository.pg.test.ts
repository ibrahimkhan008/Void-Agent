import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(), predicates: [] as unknown[], inserted: [] as unknown[] }));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashMessagingApproval, hashMessagingApprovalToken } from "lib/ai/tools/hitl/messaging-approval";
import { messagingApprovalRepository } from "./messaging-approval-repository.pg";

const payload = { provider: "zulip" as const, destination: "general", topic: "updates", content: "Reviewed" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.predicates.length = 0; mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("messagingApprovalRepository", () => {
  it("stores only digests and issues a short-lived token", async () => {
    const token = await messagingApprovalRepository.issue("user-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`messaging-effect-approval:user-1:${hashMessagingApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashMessagingApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("consumes the owner-bound exact payload once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "used" }]).mockResolvedValueOnce([]);
    const token = "messaging-token";
    expect(await messagingApprovalRepository.consume("user-1", token, payload)).toBe(true);
    expect(await messagingApprovalRepository.consume("user-1", token, payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`messaging-effect-approval:user-1:${hashMessagingApprovalToken(token)}`);
    expect(query.params).toContain(hashMessagingApproval(payload));
  });
});
