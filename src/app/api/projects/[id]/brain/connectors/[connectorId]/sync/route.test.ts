import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  getClient: vi.fn(),
  toolCall: vi.fn(),
  wherePredicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionOwnerIds: mocks.getProjectCollectionOwnerIds,
  mayEditProject: (role: string) => role !== "viewer",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { getClient: mocks.getClient, toolCall: mocks.toolCall },
}));

import { POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "22222222-2222-4222-8222-222222222222";
const connectorId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";
const serverId = "55555555-5555-4555-8555-555555555555";
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
      innerJoin: () => query,
      limit: () => Promise.resolve(result),
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
}

function makeRequest(
  options: { body?: unknown; origin?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.origin !== "")
    headers.set("Origin", options.origin ?? "https://app.example");
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  return new Request(
    `https://app.example/api/projects/${projectId}/brain/connectors/${connectorId}/sync`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        options.body ?? {
          calls: [{ toolName: "search", arguments: { query: "test" } }],
        },
      ),
    },
  );
}

const connector = (ownerUserId: string) => ({
  id: connectorId,
  projectId,
  credentialOwnerUserId: ownerUserId,
  mcpServerId: serverId,
  collectionId,
  displayName: "Docs",
  toolNames: ["search"],
  status: "active",
});

describe("project brain MCP sync authorization and idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wherePredicates.length = 0;
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.getProjectCollectionOwnerIds.mockResolvedValue([userId]);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.getClient.mockRejectedValue(new Error("Should not call MCP client"));
    mocks.toolCall.mockRejectedValue(new Error("Should not call MCP tool"));
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
      }),
    });
  });

  it("requires an idempotency key before touching connector state", async () => {
    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects a non-owner even when they can edit the shared project", async () => {
    selectRows([connector(otherUserId)]);
    mocks.getProjectCollectionOwnerIds.mockResolvedValue([userId, otherUserId]);
    const response = await POST(makeRequest({ idempotencyKey: "request-1" }), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.toolCall).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns an existing idempotent run without calling the MCP server again", async () => {
    selectRows(
      [connector(userId)],
      [{ id: serverId, userId, enabled: true }],
      [{ id: collectionId, userId }],
      [{ id: "prior-run", status: "completed", sourceItemId: "prior-source" }],
    );
    const response = await POST(
      makeRequest({ idempotencyKey: "same-request" }),
      {
        params: Promise.resolve({ id: projectId, connectorId }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      run: {
        id: "prior-run",
        status: "completed",
        sourceItemId: "prior-source",
      },
    });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.toolCall).not.toHaveBeenCalled();
  });

  it("syncs into an attached same-team collection created by another member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    selectRows(
      [connector(userId)],
      [{ id: serverId, userId, enabled: true }],
      [{ id: collectionId, userId: otherUserId, orgId: teamId }],
      [{ id: "prior-run", status: "completed", sourceItemId: "source-1" }],
    );
    const response = await POST(
      makeRequest({ idempotencyKey: "team-target" }),
      {
        params: Promise.resolve({ id: projectId, connectorId }),
      },
    );
    expect(response.status).toBe(200);
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[2] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
    expect(scope.params).toContain(collectionId);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("rejects cross-origin sync requests", async () => {
    const response = await POST(
      makeRequest({
        origin: "https://attacker.example",
        idempotencyKey: "request-2",
      }),
      {
        params: Promise.resolve({ id: projectId, connectorId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects requests with a missing Origin header", async () => {
    const response = await POST(
      makeRequest({ origin: "", idempotencyKey: "request-no-origin" }),
      {
        params: Promise.resolve({ id: projectId, connectorId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });
});
