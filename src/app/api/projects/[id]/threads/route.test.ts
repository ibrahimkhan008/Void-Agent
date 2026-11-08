import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getProjectAccessMock, pgDbMock, query } = vi.hoisted(
  () => {
    const query = {
      select: vi.fn(),
      from: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      groupBy: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    for (const method of Object.values(query)) {
      method.mockReturnValue(query);
    }
    query.limit.mockResolvedValue([]);
    return {
      getSessionMock: vi.fn(),
      getProjectAccessMock: vi.fn(),
      pgDbMock: { select: vi.fn(() => query) },
      query,
    };
  },
);

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: getProjectAccessMock,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: pgDbMock }));

import { GET } from "./route";

describe("GET /api/projects/[id]/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.values(query)) method.mockReturnValue(query);
    query.limit.mockResolvedValue([]);
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getProjectAccessMock.mockResolvedValue({ role: "editor" });
  });

  it("requires an authenticated project member", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(response.status).toBe(401);
    expect(getProjectAccessMock).not.toHaveBeenCalled();
  });

  it("returns only the caller's bounded project history without caching", async () => {
    const rows = [{ id: "thread-1", title: "Plan", lastMessageAt: null }];
    query.limit.mockResolvedValueOnce(rows);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ threads: rows });
    expect(getProjectAccessMock).toHaveBeenCalledWith("project-1", "user-1");
    expect(query.where).toHaveBeenCalledTimes(1);
    const predicate = new PgDialect().sqlToQuery(
      query.where.mock.calls[0]?.[0] as never,
    );
    expect(predicate.sql).toContain('"chat_thread"."project_id" =');
    expect(predicate.sql).toContain('"chat_thread"."user_id" =');
    expect(predicate.params).toContain("project-1");
    expect(predicate.params).toContain("user-1");
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not reveal project history to nonmembers", async () => {
    getProjectAccessMock.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "project-1" }),
    });
    expect(response.status).toBe(404);
    expect(pgDbMock.select).not.toHaveBeenCalled();
  });
});
