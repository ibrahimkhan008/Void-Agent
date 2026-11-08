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

import { agentAccessFilter } from "lib/projects/agent-access";
import { DELETE, GET, POST } from "./route";

const projectOwner = "00000000-0000-4000-8000-000000000001";
const projectEditor = "00000000-0000-4000-8000-000000000002";
const agentId = "00000000-0000-4000-8000-000000000003";
const params = Promise.resolve({ id: "project-1" });

function query(rows: unknown[], predicates: unknown[]) {
  const where = vi.fn((predicate: unknown) => {
    predicates.push(predicate);
    return {
      orderBy: () => ({ limit: async () => rows }),
      limit: async () => rows,
    };
  });
  const afterJoin = { where };
  return { from: () => ({ innerJoin: () => afterJoin, where }) };
}

function transactionWithSelectRows(rowsByCall: unknown[][]) {
  const predicates: unknown[] = [];
  const selectRows = [...rowsByCall];
  const events: string[] = [];
  const tx = {
    execute: vi.fn(async (_query?: unknown) => {
      events.push("lock");
    }),
    select: vi.fn(() => ({
      from: () => ({
        where: (predicate: unknown) => {
          events.push("select");
          predicates.push(predicate);
          return { limit: async () => selectRows.shift() ?? [] };
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ id: "assignment-1", agentId }],
        }),
      }),
    })),
  };
  mocks.transaction.mockImplementationOnce((callback) => callback(tx));
  return { tx, predicates, events };
}

function postRequest() {
  return new Request("https://example.test/api/projects/project-1/agents", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ agentId }),
  });
}

function deleteRequest() {
  return new Request(
    `https://example.test/api/projects/project-1/agents?agentId=${agentId}`,
    { method: "DELETE", headers: { origin: "https://example.test" } },
  );
}

describe("project agent assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: projectEditor } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { id: "project-1", userId: projectOwner, teamId: "team-1" },
    });
  });

  it("does not attach another user's private agent to a team project", async () => {
    const { predicates, tx } = transactionWithSelectRows([[]]);
    const response = await POST(postRequest(), { params });
    expect(response.status).toBe(404);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenCalledOnce();
    const condition = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(condition.sql).toContain('"agent"."visibility"');
    expect(condition.sql).not.toContain('"agent"."user_id"');
  });

  it("returns only public team assignments and safe, non-cacheable metadata", async () => {
    const predicates: unknown[] = [];
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { id: "project-1", userId: projectOwner, teamId: "team-1" },
    });
    mocks.select
      .mockReturnValueOnce(
        query(
          [
            {
              id: "assignment-1",
              agentId,
              createdAt: new Date(0),
              name: "Public agent",
              description: "Safe summary",
              icon: null,
            },
          ],
          predicates,
        ),
      )
      .mockReturnValueOnce(query([], predicates));

    const response = await GET(new Request("https://example.test"), { params });
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.agents).toEqual([
      expect.objectContaining({
        name: "Public agent",
        description: "Safe summary",
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("instructions");
    const attachedFilter = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(attachedFilter.sql).toContain('"agent"."visibility"');
    expect(attachedFilter.sql).not.toContain('"agent"."user_id"');
  });

  it("allows only public agents for team projects and caller-owned or public agents personally", () => {
    const teamFilter = new PgDialect().sqlToQuery(
      agentAccessFilter(projectEditor, "team-1")!,
    );
    expect(teamFilter.sql).toContain('"agent"."visibility"');
    expect(teamFilter.sql).not.toContain('"agent"."user_id"');

    const personalFilter = new PgDialect().sqlToQuery(
      agentAccessFilter(projectOwner, null)!,
    );
    expect(personalFilter.sql).toContain('"agent"."user_id"');
    expect(personalFilter.params).toContain(projectOwner);
    expect(personalFilter.sql).toContain('"agent"."visibility"');
  });

  it("lets a personal-project owner attach a private agent they own", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: projectOwner } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "owner",
      project: { id: "project-1", userId: projectOwner, teamId: null },
    });
    const { predicates, tx } = transactionWithSelectRows([
      [{ id: agentId }],
      [],
      [],
    ]);

    const response = await POST(postRequest(), { params });
    expect(response.status).toBe(201);
    expect(tx.insert).toHaveBeenCalledOnce();
    const condition = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(condition.params).toContain(projectOwner);
  });

  it("returns an existing assignment before checking the capacity limit", async () => {
    const { tx, events } = transactionWithSelectRows([
      [{ id: agentId }],
      [{ id: "assignment-1", agentId }],
    ]);
    const response = await POST(postRequest(), { params });
    expect(response.status).toBe(201);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(events[0]).toBe("lock");
  });

  it("serializes additions and refuses a new assignment when the project is full", async () => {
    const { tx, events } = transactionWithSelectRows([
      [{ id: agentId }],
      [],
      Array.from({ length: 100 }, (_, index) => ({
        id: `assignment-${index}`,
      })),
    ]);
    const response = await POST(postRequest(), { params });
    expect(response.status).toBe(409);
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(events[0]).toBe("lock");
    const lockQuery = new PgDialect().sqlToQuery(
      tx.execute.mock.calls[0][0] as never,
    );
    expect(lockQuery.sql).toContain("pg_advisory_xact_lock");
    expect(lockQuery.params).toContain("project-1");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("requires an editable project role before assignment writes", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { id: "project-1", userId: projectOwner, teamId: "team-1" },
    });
    const response = await POST(postRequest(), { params });
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("lets a team-project editor remove an assignment after its agent becomes private", async () => {
    const predicates: unknown[] = [];
    mocks.delete.mockReturnValue({
      where: (predicate: unknown) => {
        predicates.push(predicate);
        return { returning: async () => [{ id: "assignment-1" }] };
      },
    });

    const response = await DELETE(deleteRequest(), { params });
    expect(response.status).toBe(200);
    const condition = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(condition.sql).toContain('"project_agent"."project_id"');
    expect(condition.sql).toContain('"project_agent"."agent_id"');
    expect(condition.sql).not.toContain('"agent"."visibility"');
    expect(condition.sql).not.toContain('"agent"."user_id"');
  });
});
