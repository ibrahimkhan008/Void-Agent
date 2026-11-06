import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  listAccounts: vi.fn(),
  listReadActions: vi.fn(),
  wherePredicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
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
vi.mock("lib/ai/composio", () => ({
  listComposioAccountsForUser: mocks.listAccounts,
  listComposioReadActions: mocks.listReadActions,
  isReadOnlyComposioAction: (slug: string) =>
    /(^|_)(GET|LIST|SEARCH|FIND|FETCH|READ|QUERY)(_|$)/i.test(slug) &&
    !/(^|_)(CREATE|UPDATE|DELETE|REMOVE|SEND|WRITE|POST|PUT|PATCH|UPLOAD|EXECUTE)(_|$)/i.test(
      slug,
    ),
}));

import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const collectionId = "33333333-3333-4333-8333-333333333333";
const teamId = "66666666-6666-4666-8666-666666666666";
const accountId = "conn_abcd1234";

function makeRequest(body: unknown, origin = "https://app.example") {
  return new Request(
    `https://app.example/api/projects/${projectId}/brain/composio`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    },
  );
}

describe("project brain Composio connector attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wherePredicates.length = 0;
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.select.mockImplementation(() => {
      const query = {
        from: () => query,
        where: (predicate: unknown) => {
          mocks.wherePredicates.push(predicate);
          return query;
        },
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve([{ id: collectionId }]).then(resolve),
      };
      return query;
    });
    mocks.listAccounts.mockResolvedValue([
      {
        id: accountId,
        status: "ACTIVE",
        isDisabled: false,
        toolkit: { slug: "github" },
      },
    ]);
    mocks.listReadActions.mockResolvedValue([
      {
        slug: "GITHUB_GET_REPOS",
        inputParameters: { type: "object", properties: {}, required: [] },
      },
      {
        slug: "GITHUB_CREATE_ISSUE",
        inputParameters: { type: "object", properties: {}, required: [] },
      },
    ]);
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () =>
            Promise.resolve([
              {
                id: "connector-1",
                displayName: "Github",
                readActionSlugs: ["GITHUB_GET_REPOS"],
              },
            ]),
        }),
      }),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("persists only supported read actions for the user's active connected account", async () => {
    const response = await POST(
      makeRequest({ connectedAccountId: accountId, collectionId }),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      connector: {
        id: "connector-1",
        displayName: "Github",
        readActionSlugs: ["GITHUB_GET_REPOS"],
      },
    });
    expect(mocks.listAccounts).toHaveBeenCalledWith(userId);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("allows an editor to target an attached same-team collection created by another member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.select.mockImplementation(() => {
      const query = {
        from: () => query,
        where: (predicate: unknown) => {
          mocks.wherePredicates.push(predicate);
          return query;
        },
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve([
            { id: collectionId, userId: "creator", orgId: teamId },
          ]).then(resolve),
      };
      return query;
    });
    const response = await POST(
      makeRequest({ connectedAccountId: accountId, collectionId }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.listAccounts).toHaveBeenCalledWith(userId);
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[0] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
  });

  it("lists attached same-team collections for a current project member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    let index = 0;
    const rows = [[], [{ id: collectionId, name: "Shared docs" }]];
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
    const response = await GET(new Request("https://app.example"), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).collections).toEqual([
      { id: collectionId, name: "Shared docs" },
    ]);
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[1] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
  });

  it("rejects a cross-origin request before reading project collections", async () => {
    const response = await POST(
      makeRequest(
        { connectedAccountId: accountId, collectionId },
        "https://attacker.example",
      ),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects a viewer before reading external accounts", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    const response = await POST(
      makeRequest({ connectedAccountId: accountId, collectionId }),
      {
        params: Promise.resolve({ id: projectId }),
      },
    );
    expect(response.status).toBe(403);
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });
});
