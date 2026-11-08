import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as { user: { id: string } } | null,
  rows: [] as Array<{ accessToken: string | null }>,
  selectedPredicates: [] as unknown[],
  updatePredicates: [] as unknown[],
  updates: [] as unknown[],
  revoke: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({
  getSession: vi.fn(async () => mocks.session),
}));
vi.mock("lib/connectors/refresh", () => ({
  revokeConnectorToken: mocks.revoke,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => {
          mocks.selectedPredicates.push(predicate);
          return { limit: async () => mocks.rows };
        },
      }),
    }),
    update: () => ({
      set: (value: unknown) => {
        mocks.updates.push(value);
        return {
          where: (predicate: unknown) => {
            mocks.updatePredicates.push(predicate);
            return Promise.resolve([]);
          },
        };
      },
    }),
  },
}));

import { POST } from "./route";

const post = (provider: string) =>
  POST({} as never, { params: Promise.resolve({ provider }) });

beforeEach(() => {
  mocks.session = { user: { id: "user-1" } };
  mocks.rows = [];
  mocks.selectedPredicates.length = 0;
  mocks.updatePredicates.length = 0;
  mocks.updates.length = 0;
  mocks.revoke.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/connectors/[provider]/disconnect", () => {
  it("revokes and clears connector tokens under the owning user's scope", async () => {
    mocks.rows = [{ accessToken: "access-token" }];
    const response = await post("confluence");
    expect(response.status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith("confluence", "access-token");
    expect(mocks.updates[0]).toMatchObject({
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    });
    for (const predicate of [
      ...mocks.selectedPredicates,
      ...mocks.updatePredicates,
    ]) {
      const query = new PgDialect().sqlToQuery(predicate as never);
      expect(query.params).toContain("user-1");
      expect(query.params).toContain("confluence");
    }
  });

  it("rejects unknown providers and requires authentication", async () => {
    expect((await post("not-real")).status).toBe(400);
    expect(mocks.selectedPredicates).toHaveLength(0);
    mocks.session = null;
    expect((await post("gmail")).status).toBe(401);
    expect(mocks.selectedPredicates).toHaveLength(0);
  });
});
