import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: undefined as any,
  conditions: undefined as any,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (column: string, value: unknown) => ({ op: "eq", column, value }),
  gt: (column: string, value: unknown) => ({ op: "gt", column, value }),
  lt: (column: string, value: unknown) => ({ op: "lt", column, value }),
  like: (column: string, value: unknown) => ({ op: "like", column, value }),
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  VerificationTable: {
    identifier: "identifier",
    value: "value",
    expiresAt: "expiresAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    id: "id",
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    delete: () => ({
      where: (condition: any) => {
        mocks.conditions = condition.conditions;
        return {
          returning: async () => {
            const eqs = mocks.conditions.filter(
              (item: any) => item.op === "eq",
            );
            const expiry = mocks.conditions.find(
              (item: any) => item.op === "gt" && item.column === "expiresAt",
            );
            const matches =
              mocks.row &&
              eqs.every(
                (condition: any) =>
                  mocks.row[condition.column] === condition.value,
              ) &&
              mocks.row.expiresAt > expiry?.value;
            if (!matches) return [];
            mocks.row = undefined;
            return [{ id: "used" }];
          },
        };
      },
    }),
    insert: () => ({
      values: async (row: any) => {
        mocks.row = row;
      },
    }),
  },
}));

import { connectorActionApprovalRepository } from "./connector-action-approval-repository.pg";

const approval = {
  provider: "gmail" as const,
  action: "send" as const,
  payload: { to: "user@example.test", subject: "Subject", message: "Body" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = undefined;
  mocks.conditions = undefined;
});

describe("connector action approval repository", () => {
  it("stores only hashed token and exact payload digest, then allows a single owner-bound consume", async () => {
    const now = new Date();
    const token = await connectorActionApprovalRepository.issue(
      "owner-1",
      approval,
      now,
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(mocks.row.identifier).toContain(
      "connector-action-approval-v1:owner-1:",
    );
    expect(mocks.row.identifier).not.toContain(token);
    expect(mocks.row.value).not.toContain("user@example.test");
    expect(mocks.row.expiresAt.getTime()).toBe(now.getTime() + 5 * 60_000);

    await expect(
      connectorActionApprovalRepository.consume("owner-2", token, approval),
    ).resolves.toBe(false);
    await expect(
      connectorActionApprovalRepository.consume("owner-1", token, {
        ...approval,
        payload: { ...approval.payload, message: "changed" },
      }),
    ).resolves.toBe(false);
    await expect(
      connectorActionApprovalRepository.consume("owner-1", token, approval),
    ).resolves.toBe(true);
    await expect(
      connectorActionApprovalRepository.consume("owner-1", token, approval),
    ).resolves.toBe(false);
  });

  it("rejects malformed approval tokens before database consumption", async () => {
    await expect(
      connectorActionApprovalRepository.consume("owner-1", "short", approval),
    ).resolves.toBe(false);
    expect(mocks.conditions).toBeUndefined();
  });
});
