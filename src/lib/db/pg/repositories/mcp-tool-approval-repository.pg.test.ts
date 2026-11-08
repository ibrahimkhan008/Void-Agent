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
  hashMcpToolApproval,
  hashMcpToolApprovalToken,
} from "lib/ai/tools/hitl/mcp-tool-approval";
import { mcpToolApprovalRepository } from "./mcp-tool-approval-repository.pg";

const payload = {
  serverId: "00000000-0000-4000-8000-000000000001",
  serverName: "CRM",
  toolName: "update_record",
  payload: { id: "1" },
};
const configFingerprint = "a".repeat(64);

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

describe("mcpToolApprovalRepository", () => {
  it("stores only user-scoped token and payload hashes", async () => {
    const token = await mcpToolApprovalRepository.issue(
      "user-1",
      payload,
      configFingerprint,
    );
    const stored = mocks.inserted[0] as {
      identifier: string;
      value: string;
      expiresAt: Date;
    };
    expect(stored.identifier).toBe(
      `mcp-tool-approval:user-1:${hashMcpToolApprovalToken(token)}`,
    );
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(
      `${hashMcpToolApproval(payload)}:${configFingerprint}`,
    );
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("consumes the exact approval only once", async () => {
    mocks.returning
      .mockResolvedValueOnce([{ id: "used" }])
      .mockResolvedValueOnce([]);
    expect(
      await mcpToolApprovalRepository.consume(
        "user-1",
        "opaque-mcp-token",
        payload,
        configFingerprint,
      ),
    ).toBe(true);
    expect(
      await mcpToolApprovalRepository.consume(
        "user-1",
        "opaque-mcp-token",
        payload,
        configFingerprint,
      ),
    ).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(
      `mcp-tool-approval:user-1:${hashMcpToolApprovalToken("opaque-mcp-token")}`,
    );
    expect(query.params).toContain(
      `${hashMcpToolApproval(payload)}:${configFingerprint}`,
    );
  });
});
