import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: undefined as Record<string, any> | undefined,
  lastWhere: undefined as any,
  insert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/schema.pg", () => ({
  VerificationTable: {
    identifier: "identifier",
    value: "value",
    expiresAt: "expiresAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (column: string, value: unknown) => ({ op: "eq", column, value }),
  gt: (column: string, value: unknown) => ({ op: "gt", column, value }),
  lt: (column: string, value: unknown) => ({ op: "lt", column, value }),
  like: (column: string, value: unknown) => ({ op: "like", column, value }),
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    delete: () => ({
      where: (condition: unknown) => {
        mocks.lastWhere = condition;
        return {
          returning: async () => {
            const conditions =
              (condition as { conditions?: any[] }).conditions ?? [];
            const identifierCondition = conditions.find(
              (item) => item.op === "eq" && item.column === "identifier",
            );
            const expiryCondition = conditions.find(
              (item) => item.op === "gt" && item.column === "expiresAt",
            );
            if (
              mocks.row &&
              mocks.row.identifier === identifierCondition?.value &&
              mocks.row.expiresAt > expiryCondition?.value
            ) {
              const consumed = mocks.row;
              mocks.row = undefined;
              return [{ value: consumed.value }];
            }
            return [];
          },
        };
      },
    }),
    insert: () => ({
      values: (row: Record<string, any>) => {
        mocks.row = row;
        mocks.insert(row);
      },
    }),
  },
}));

import {
  consumeConnectorOAuthState,
  issueConnectorOAuthState,
} from "./oauth-state";

const KEY = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = undefined;
  process.env.ENCRYPTION_MASTER_KEY = KEY;
});

describe("connector OAuth state", () => {
  it("stores encrypted user/provider binding and consumes signed state exactly once", async () => {
    const now = new Date("2026-11-10T10:00:00.000Z");
    const state = await issueConnectorOAuthState(
      {
        userId: "user-private-id",
        provider: "gmail",
        redirectUri: "https://void.example/api/connectors/gmail/callback",
        verifier: "v".repeat(43),
      },
      now,
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(mocks.row?.identifier).not.toContain("user-private-id");
    expect(mocks.row?.value).not.toContain("user-private-id");
    expect(mocks.row?.expiresAt.getTime()).toBe(now.getTime() + 10 * 60_000);

    const consumed = await consumeConnectorOAuthState(
      state,
      new Date(now.getTime() + 1000),
    );
    expect(mocks.row).toBeUndefined();
    expect(consumed).toEqual({
      userId: "user-private-id",
      provider: "gmail",
      redirectUri: "https://void.example/api/connectors/gmail/callback",
      verifier: "v".repeat(43),
    });
    await expect(
      consumeConnectorOAuthState(state, new Date(now.getTime() + 2000)),
    ).resolves.toBeNull();
  });

  it("rejects tampering and expired state without revealing stored data", async () => {
    const now = new Date("2026-11-10T10:00:00.000Z");
    const state = await issueConnectorOAuthState(
      {
        userId: "user-1",
        provider: "github",
        redirectUri: "https://void.example/api/connectors/github/callback",
      },
      now,
    );
    const tampered = `${state.slice(0, -1)}${state.endsWith("A") ? "B" : "A"}`;
    await expect(
      consumeConnectorOAuthState(tampered, new Date(now.getTime() + 1)),
    ).resolves.toBeNull();
    await expect(
      consumeConnectorOAuthState(state, new Date(now.getTime() + 10 * 60_000)),
    ).resolves.toBeNull();
    expect(mocks.row).toBeDefined();
  });

  it("fails closed when the encryption/signing key is unavailable", async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    await expect(
      issueConnectorOAuthState({
        userId: "user-1",
        provider: "gmail",
        redirectUri: "https://void.example/api/connectors/gmail/callback",
      }),
    ).rejects.toThrow("Connector token encryption is not configured");
    await expect(
      consumeConnectorOAuthState("x".repeat(90)),
    ).resolves.toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
