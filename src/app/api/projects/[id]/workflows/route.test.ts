import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: mocks.select,
    transaction: mocks.transaction,
    delete: mocks.delete,
  },
}));

import { DELETE, GET, POST } from "./route";

const editorId = "00000000-0000-4000-8000-000000000001";
const workflowId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: "project-1" }) };

function query(rows: unknown[], predicates: unknown[]) {
  const where = vi.fn((predicate: unknown) => {
    predicates.push(predicate);
    return {
      innerJoin: () => ({
        orderBy: () => ({ limit: async () => rows }),
      }),
      orderBy: () => ({ limit: async () => rows }),
      limit: async () => rows,
    };
  });
  return { from: () => ({ innerJoin: () => ({ where }), where }) };
}

function postRequest(id = workflowId) {
  return new Request("https://example.test/api/projects/project-1/workflows", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowId: id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: editorId } });
  mocks.getProjectAccess.mockResolvedValue({
    role: "editor",
    project: { id: "project-1", userId: editorId, teamId: "team-1" },
  });
});

describe("project workflow assignments", () => {
  it("returns only team-authorized assignments and attachable workflows", async () => {
    const predicates: unknown[] = [];
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { id: "project-1", userId: "owner-1", teamId: "team-1" },
    });
    mocks.select
      .mockReturnValueOnce(
        query(
          [
            {
              id: "assignment-1",
              workflowId,
              status: "active",
              name: "Team workflow",
              description: "Safe metadata",
              icon: null,
            },
          ],
          predicates,
        ),
      )
      .mockReturnValueOnce(query([], predicates));

    const response = await GET(new Request("https://example.test"), params);
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.workflows[0]).toMatchObject({ name: "Team workflow" });
    expect(body.availableWorkflows).toEqual([]);
    const filters = predicates.map((predicate) =>
      new PgDialect().sqlToQuery(predicate as never),
    );
    expect(filters).toHaveLength(1);
    expect(filters[0]?.sql).toContain('"workflow"."org_id"');
    expect(filters[0]?.params).toContain("team-1");
    expect(filters[0]?.sql).not.toContain('"workflow"."user_id"');
  });

  it("attaches an authorized workflow idempotently under the project lock", async () => {
    const predicates: unknown[] = [];
    const events: string[] = [];
    const rows = [[{ id: workflowId }], [], []];
    const tx = {
      execute: vi.fn(async () => events.push("lock")),
      select: vi.fn(() => ({
        from: () => ({
          where: (predicate: unknown) => {
            predicates.push(predicate);
            events.push("select");
            return { limit: async () => rows.shift() ?? [] };
          },
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "assignment-1", workflowId }],
          }),
        }),
      })),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await POST(postRequest(), params);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      assignment: { id: "assignment-1", workflowId },
    });
    expect(events[0]).toBe("lock");
    expect(tx.insert).toHaveBeenCalledOnce();
    const accessFilter = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(accessFilter.sql).toContain('"workflow"."org_id"');
    expect(accessFilter.params).toContain("team-1");
  });

  it("does not attach another team's or private workflow to a team project", async () => {
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      })),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await POST(postRequest(), params);
    expect(response.status).toBe(404);
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("serializes workflow additions and enforces the project assignment cap", async () => {
    const rows = [
      [{ id: workflowId }],
      [],
      Array.from({ length: 100 }, (_, index) => ({
        id: `assignment-${index}`,
      })),
    ];
    const events: string[] = [];
    const tx = {
      execute: vi.fn(async () => events.push("lock")),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: async () => rows.shift() ?? [] }),
        }),
      })),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await POST(postRequest(), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "A project can have at most 100 assigned workflows",
    });
    expect(events[0]).toBe("lock");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("requires editor access and same-origin before mutation", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { id: "project-1", teamId: "team-1" },
    });
    expect((await POST(postRequest(), params)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { id: "project-1", teamId: "team-1" },
    });
    const crossOrigin = new Request(
      "https://example.test/api/projects/project-1/workflows",
      {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ workflowId }),
      },
    );
    expect((await POST(crossOrigin, params)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("deletes only the project association after same-origin validation", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "assignment-1" }]);
    let predicate: unknown;
    const where = vi.fn((value: unknown) => {
      predicate = value;
      return { returning };
    });
    mocks.delete.mockReturnValue({ where });
    const request = new Request(
      `https://example.test/api/projects/project-1/workflows?workflowId=${workflowId}`,
      { method: "DELETE", headers: { origin: "https://example.test" } },
    );

    const response = await DELETE(request, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.delete).toHaveBeenCalledOnce();
    const condition = new PgDialect().sqlToQuery(predicate as never);
    expect(condition.sql).toContain('"project_workflow"."project_id"');
    expect(condition.sql).toContain('"project_workflow"."workflow_id"');
    expect(condition.params).toEqual(
      expect.arrayContaining(["project-1", workflowId]),
    );

    mocks.delete.mockClear();
    const crossOrigin = new Request(request.url, {
      method: "DELETE",
      headers: { origin: "https://attacker.test" },
    });
    expect((await DELETE(crossOrigin, params)).status).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
