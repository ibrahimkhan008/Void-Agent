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

describe("POST /api/connectors/[provider]/pause", () => {
  it("rejects unknown providers before querying the database", async () => {
    const response = await post("arbitrary-provider");
    expect(response.status).toBe(400);
    expect(mocks.selectedPredicates).toHaveLength(0);
  });

  it("pauses expanded providers without clearing tokens and scopes both queries to the owner", async () => {
    mocks.rows = [{ isConnected: true, isPaused: false }];
    const response = await post("confluence");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "paused" });
    expect(mocks.updates[0]).toMatchObject({ isPaused: true });
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

  it("does not mutate a disconnected connector", async () => {
    mocks.rows = [{ isConnected: false, isPaused: false }];
    const response = await post("gmail");
    expect(response.status).toBe(409);
    expect(mocks.updates).toHaveLength(0);
  });

  it("requires an authenticated owner", async () => {
    mocks.session = null;
    const response = await post("gmail");
    expect(response.status).toBe(401);
    expect(mocks.selectedPredicates).toHaveLength(0);
  });
});
