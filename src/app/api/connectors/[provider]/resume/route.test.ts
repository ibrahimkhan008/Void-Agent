import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as { user: { id: string } } | null,
  rows: [] as Array<{ isConnected: boolean; isPaused: boolean | null }>,
  selectedPredicates: [] as unknown[],
  updatePredicates: [] as unknown[],
  updates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({
  getSession: vi.fn(async () => mocks.session),
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
            return {
              returning: async () => [{ id: "connector-1" }],
            };
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
});

describe("POST /api/connectors/[provider]/resume", () => {
  it("resumes a provider from the expanded catalog and preserves credentials", async () => {
    mocks.rows = [{ isConnected: true, isPaused: true }];
    const response = await post("confluence");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "resumed" });
    expect(mocks.updates[0]).toMatchObject({ isPaused: false });
    expect(mocks.updates[0]).not.toHaveProperty("accessToken");
    for (const predicate of [
      ...mocks.selectedPredicates,
      ...mocks.updatePredicates,
    ]) {
      const query = new PgDialect().sqlToQuery(predicate as never);
      expect(query.params).toContain("user-1");
      expect(query.params).toContain("confluence");
    }
  });

  it("rejects unknown providers and missing or disconnected connectors", async () => {
    expect((await post("not-real")).status).toBe(400);
    expect(mocks.selectedPredicates).toHaveLength(0);

    expect((await post("gmail")).status).toBe(404);
    mocks.rows = [{ isConnected: false, isPaused: true }];
    expect((await post("gmail")).status).toBe(409);
    expect(mocks.updates).toHaveLength(0);
  });

  it("requires an authenticated owner", async () => {
    mocks.session = null;
    const response = await post("gmail");
    expect(response.status).toBe(401);
    expect(mocks.selectedPredicates).toHaveLength(0);
  });
});
