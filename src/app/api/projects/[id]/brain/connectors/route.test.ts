import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  getClient: vi.fn(),
  wherePredicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role !== "viewer",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { getClient: mocks.getClient },
}));

import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const serverId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";
const teamId = "66666666-6666-4666-8666-666666666666";

function selectRows(...rows: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => {
    const result = rows[index++] ?? [];
    const query = {
      from: () => query,
      where: (predicate: unknown) => {
        mocks.wherePredicates.push(predicate);
        return query;
      },
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
}

function makeRequest(body: unknown, origin = "https://app.example") {
  return new Request(
    `https://app.example/api/projects/${projectId}/brain/connectors`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    },
  );
}

describe("project brain MCP connector attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wherePredicates.length = 0;
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    selectRows(
      [{ id: serverId, name: "Docs MCP", enabled: true, userId }],
      [{ id: collectionId, name: "Project docs", userId }],
    );
    const toolInfo = [
      {
        name: "search_docs",
        description: "Search documents",
        annotations: { readOnlyHint: true },
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "delete_doc",
        description: "Delete documents",
        annotations: { readOnlyHint: false },
        inputSchema: { type: "object", properties: {} },
      },
    ];
    mocks.getClient.mockResolvedValue({
      client: { connect: vi.fn(), updateToolInfo: vi.fn(), toolInfo },
    });
    const returning = vi.fn().mockResolvedValue([
      {
        id: "connector-id",
        toolNames: ["search_docs"],
        displayName: "Docs MCP",
      },
    ]);
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({ returning }),
      }),
    });
  });

  it("persists only explicitly read-only MCP tools without returning server config", async () => {
    const response = await POST(
      makeRequest({ mcpServerId: serverId, collectionId }),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      connector: {
        id: "connector-id",
        toolNames: ["search_docs"],
        displayName: "Docs MCP",
      },
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("allows an editor to target an attached same-team collection created by another member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    selectRows(
      [{ id: serverId, name: "Docs MCP", enabled: true, userId }],
      [{ id: collectionId, name: "Shared docs" }],
    );
    const response = await POST(
      makeRequest({ mcpServerId: serverId, collectionId }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(201);
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[1] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("lists an attached same-team collection created by another member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    selectRows(
      [],
      [{ id: serverId, name: "Docs MCP" }],
      [{ id: collectionId, name: "Shared docs" }],
    );
    const response = await GET(new Request("https://app.example"), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).collections).toEqual([
      { id: collectionId, name: "Shared docs" },
    ]);
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[2] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
  });

  it("rejects a cross-origin attachment before reading connector data", async () => {
    const response = await POST(
      makeRequest(
        { mcpServerId: serverId, collectionId },
        "https://attacker.example",
      ),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects project viewers", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    const response = await POST(
      makeRequest({ mcpServerId: serverId, collectionId }),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("refuses to attach a server that advertises no explicitly read-only tool", async () => {
    mocks.getClient.mockResolvedValue({
      client: {
        connect: vi.fn(),
        updateToolInfo: vi.fn(),
        toolInfo: [
          {
            name: "delete_doc",
            description: "Delete",
            annotations: { readOnlyHint: false },
          },
        ],
      },
    });
    const response = await POST(
      makeRequest({ mcpServerId: serverId, collectionId }),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(422);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
