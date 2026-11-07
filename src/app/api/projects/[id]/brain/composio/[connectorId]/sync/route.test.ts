import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  listAccounts: vi.fn(),
  listReadActions: vi.fn(),
  gatherSource: vi.fn(),
  createdRuns: [] as Array<unknown[]>,
  update: vi.fn(),
  execute: vi.fn(),
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
  pgDb: { select: mocks.select, insert: mocks.insert, update: mocks.update },
}));
vi.mock("lib/projects/composio-gather", () => ({
  gatherComposioProjectSource: mocks.gatherSource,
}));
vi.mock("lib/ai/composio", () => ({
  listComposioAccountsForUser: mocks.listAccounts,
  listComposioReadActions: mocks.listReadActions,
  isReadOnlyComposioAction: (slug: string) =>
    /(^|_)(GET|LIST|SEARCH|FIND|FETCH|READ|QUERY)(_|$)/i.test(slug) &&
    !/(^|_)(CREATE|UPDATE|DELETE|REMOVE|SEND|WRITE|POST|PUT|PATCH|UPLOAD|EXECUTE)(_|$)/i.test(
      slug,
    ),
  executeComposioReadAction: mocks.execute,
}));

import { POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "22222222-2222-4222-8222-222222222222";
const connectorId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";
const teamId = "66666666-6666-4666-8666-666666666666";

function makeRequest(
  options: { origin?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.origin !== "")
    headers.set("Origin", options.origin ?? "https://app.example");
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  return new Request(
    `https://app.example/api/projects/${projectId}/brain/composio/${connectorId}/sync`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        calls: [{ actionSlug: "GITHUB_GET_REPOS", arguments: {} }],
      }),
    },
  );
}

function selectRows(...rows: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => {
    const result = rows[index++] ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: (predicate: unknown) => {
        mocks.wherePredicates.push(predicate);
        return query;
      },
      limit: () => Promise.resolve(result),
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
}

const connector = (ownerUserId: string) => ({
  id: connectorId,
  projectId,
  credentialOwnerUserId: ownerUserId,
  collectionId,
  connectedAccountId: "account-1",
  toolkitSlug: "github",
  readActionSlugs: ["GITHUB_GET_REPOS"],
  status: "active",
});

describe("project brain Composio sync authorization and idempotency", () => {
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
    mocks.createdRuns = [];
    mocks.insert.mockImplementation(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve(mocks.createdRuns.shift() ?? []),
        }),
      }),
    }));
    mocks.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve([]) }),
    });
    mocks.listAccounts.mockResolvedValue([
      {
        id: "account-1",
        status: "ACTIVE",
        isDisabled: false,
        toolkit: { slug: "github" },
      },
    ]);
    mocks.listReadActions.mockResolvedValue([]);
  });

  it("requires an idempotency key before reading connector state", async () => {
    const response = await POST(makeRequest(), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects sync by a project editor who does not own the connected account", async () => {
    selectRows([connector(otherUserId)]);
    mocks.getProjectCollectionOwnerIds.mockResolvedValue([userId, otherUserId]);
    const response = await POST(makeRequest({ idempotencyKey: "request-1" }), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.listAccounts).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an existing run without executing the provider action again", async () => {
    selectRows(
      [connector(userId)],
      [{ id: collectionId }],
      [{ id: "prior-run", status: "completed", sourceItemId: "source-1" }],
    );
    const response = await POST(makeRequest({ idempotencyKey: "request-2" }), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      run: { id: "prior-run", status: "completed", sourceItemId: "source-1" },
    });
    expect(mocks.listAccounts).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("syncs into an attached same-team collection created by another member", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "editor",
    });
    selectRows(
      [connector(userId)],
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
    const scope = new PgDialect().sqlToQuery(mocks.wherePredicates[1] as never);
    expect(scope.sql).toContain('"collection"."org_id"');
    expect(scope.params).toContain(teamId);
    expect(scope.params).toContain(userId);
    expect(scope.params).toContain(collectionId);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects cross-origin sync requests before connector access", async () => {
    const response = await POST(
      makeRequest({
        origin: "https://attacker.example",
        idempotencyKey: "request-3",
      }),
      { params: Promise.resolve({ id: projectId, connectorId }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("passes only persisted project scope and the session actor to gather inference", async () => {
    const createdRun = { id: "run-gather", status: "running" };
    mocks.createdRuns.push([createdRun]);
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Project",
        teamId,
        collectionIds: [collectionId],
      },
      role: "editor",
    });
    mocks.gatherSource.mockRejectedValue(new Error("provider unavailable"));
    selectRows([connector(userId)], [{ id: collectionId }]);

    const request = new Request(
      `https://app.example/api/projects/${projectId}/brain/composio/${connectorId}/sync`,
      {
        method: "POST",
        headers: {
          Origin: "https://app.example",
          "Content-Type": "application/json",
          "Idempotency-Key": "gather-team-run",
        },
        body: JSON.stringify({ mode: "gather" }),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: projectId, connectorId }),
    });

    expect(response.status).toBe(502);
    expect(mocks.gatherSource).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        teamId,
        role: "editor",
        idempotencyScope: "project-brain-composio-gather:run-gather",
      }),
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns a budget denial and never starts gather inference", async () => {
    const createdRun = { id: "run-denied", status: "running" };
    mocks.createdRuns.push([createdRun]);
    const { TeamBudgetExceededError } = await import(
      "lib/ai/team-member-ai-budget-core"
    );
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Project",
        teamId,
        collectionIds: [collectionId],
      },
      role: "editor",
    });
    mocks.gatherSource.mockRejectedValue(new TeamBudgetExceededError());
    selectRows([connector(userId)], [{ id: collectionId }]);

    const request = new Request(
      `https://app.example/api/projects/${projectId}/brain/composio/${connectorId}/sync`,
      {
        method: "POST",
        headers: {
          Origin: "https://app.example",
          "Content-Type": "application/json",
          "Idempotency-Key": "gather-denied",
        },
        body: JSON.stringify({ mode: "gather" }),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: projectId, connectorId }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "This team member's AI allowance has been reached.",
    });
    expect(mocks.gatherSource).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps manual read-action sync outside the gather budget workflow", async () => {
    const createdRun = { id: "run-manual", status: "running" };
    mocks.createdRuns.push([createdRun]);
    const manualText = `## GITHUB_GET_REPOS\n${JSON.stringify({
      successful: true,
      data: { repos: ["void"] },
    })}`;
    selectRows(
      [connector(userId)],
      [{ id: collectionId }],
      [{ itemId: "source-reused", content: manualText }],
    );
    mocks.execute.mockResolvedValue({
      successful: true,
      data: { repos: ["void"] },
    });
    mocks.listReadActions.mockResolvedValue([
      {
        slug: "GITHUB_GET_REPOS",
        inputParameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ]);

    const response = await POST(makeRequest({ idempotencyKey: "manual-1" }), {
      params: Promise.resolve({ id: projectId, connectorId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      run: { status: "completed", sourceItemId: "source-reused", reused: true },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.gatherSource).not.toHaveBeenCalled();
  });
});
