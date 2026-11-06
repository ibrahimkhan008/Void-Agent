import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), insert: vi.fn(), where: vi.fn(), returning: vi.fn(), values: vi.fn(), predicates: [] as unknown[], inserted: [] as unknown[] }));
vi.mock("../db.pg", () => ({ pgDb: { delete: mocks.delete, insert: mocks.insert } }));
vi.mock("server-only", () => ({}));

import { hashDriveApprovalToken, hashDriveFileApproval } from "lib/ai/tools/hitl/drive-file-approval";
import { driveApprovalRepository } from "./drive-approval-repository.pg";

const payload = { name: "notes.txt", content: "Reviewed" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.predicates.length = 0; mocks.inserted.length = 0;
  mocks.where.mockImplementation((predicate: unknown) => { mocks.predicates.push(predicate); return { returning: mocks.returning }; });
  mocks.delete.mockReturnValue({ where: mocks.where });
  mocks.values.mockImplementation((value: unknown) => { mocks.inserted.push(value); return Promise.resolve(); });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("driveApprovalRepository", () => {
  it("stores only digests with ten-minute expiry", async () => {
    const token = await driveApprovalRepository.issue("user-1", payload);
    const stored = mocks.inserted[0] as { identifier: string; value: string; expiresAt: Date };
    expect(stored.identifier).toBe(`drive-file-approval:user-1:${hashDriveApprovalToken(token)}`);
    expect(stored.identifier).not.toContain(token);
    expect(stored.value).toBe(hashDriveFileApproval(payload));
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("consumes only the owner-bound exact payload once", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "used" }]).mockResolvedValueOnce([]);
    const token = "opaque-drive-token";
    expect(await driveApprovalRepository.consume("user-1", token, payload)).toBe(true);
    expect(await driveApprovalRepository.consume("user-1", token, payload)).toBe(false);
    const query = new PgDialect().sqlToQuery(mocks.predicates[1] as never);
    expect(query.params).toContain(`drive-file-approval:user-1:${hashDriveApprovalToken(token)}`);
    expect(query.params).toContain(hashDriveFileApproval(payload));
  });
});
