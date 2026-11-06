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
vi.mock("../db.pg", () => ({
  pgDb: { delete: mocks.delete, insert: mocks.insert },
}));
vi.mock("server-only", () => ({}));

import {
  hashHttpRequestApproval,
  hashHttpRequestApprovalToken,
} from "lib/ai/tools/hitl/http-request-approval";
import { httpRequestApprovalRepository } from "./http-request-approval-repository.pg";

const payload = {
  url: "https://api.example.com/items",
  method: "POST" as const,
  headers: {},
  body: "{}",
  timeout: 10_000,
};
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

describe("httpRequestApprovalRepository", () => {
  it("stores only scoped token and exact request hashes", async () => {
    const token = await httpRequestApprovalRepository.issue("user-1", payload);
    const stored = mocks.inserted[0] as {
      identifier: string;
      value: string;
      expiresAt: Date;
    };
    expect(stored.identifier).toBe(
      `http-request-approval:user-1:${hashHttpRequestApprovalToken(token)}`,
    );
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashHttpRequestApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  });
  it("consumes only the exact approved request once", async () => {
    mocks.returning
      .mockResolvedValueOnce([{ id: "used" }])
      .mockResolvedValueOnce([]);
    expect(
      await httpRequestApprovalRepository.consume(
        "user-1",
        "opaque-http-token",
        payload,
      ),
    ).toBe(true);
    expect(
      await httpRequestApprovalRepository.consume(
        "user-1",
        "opaque-http-token",
        payload,
      ),
    ).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(
      `http-request-approval:user-1:${hashHttpRequestApprovalToken("opaque-http-token")}`,
    );
    expect(query.params).toContain(hashHttpRequestApproval(payload));
  });
});
