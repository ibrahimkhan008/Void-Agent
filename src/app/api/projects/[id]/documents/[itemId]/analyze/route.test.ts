import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  hasSameOrigin: vi.fn(),
  getModel: vi.fn(),
  generateObject: vi.fn(),
  select: vi.fn(),
  predicates: [] as unknown[],
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModelWithFailureFallbackAsync: mocks.getModel },
}));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId, itemId }) };

function builder(row: unknown) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin"])
    value[method] = vi.fn(() => value);
  value.where = vi.fn((predicate: unknown) => {
    mocks.predicates.push(predicate);
    return value;
  });
  value.limit = vi.fn(async () => (row ? [row] : []));
  return value;
}

function request(body: unknown, origin = "http://localhost") {
  return new Request(
    `http://localhost/api/projects/${projectId}/documents/${itemId}/analyze`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function sqlFor(predicate: unknown) {
  return new PgDialect().sqlToQuery(predicate as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId], teamId: "team-1" },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([
    "member-1",
    "creator-1",
  ]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.hasSameOrigin.mockReturnValue(true);
  mocks.getModel.mockResolvedValue("model");
  mocks.generateObject.mockResolvedValue({
    object: {
      answer: "The plan is to launch in June.",
      citations: [
        { quote: "Launch target: June." },
        { quote: "This quote is invented." },
      ],
    },
  });
  mocks.select.mockReturnValue(
    builder({
      filename: "plan.txt",
      content: "The project plan states: Launch target: June.",
    }),
  );
});

describe("project document analysis", () => {
  it("answers from the authorized source and returns only exact source citations", async () => {
    const response = await POST(
      request({ question: "When is launch?" }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      answer: "The plan is to launch in June.",
      filename: "plan.txt",
      citations: [{ source: "plan.txt", quote: "Launch target: June." }],
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model",
        prompt: expect.stringContaining("untrusted evidence"),
      }),
    );
    const query = sqlFor(mocks.predicates[0]);
    expect(query.sql).toContain('"project_document"."project_id"');
    expect(query.sql).toContain('"collection_item"."collection_id"');
    expect(query.params).toContain(projectId);
    expect(query.params).toContain(itemId);
    expect(query.params).toContain(collectionId);
  });

  it("requires same-origin and current project access before reading source data", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (await POST(request({ question: "Question?" }), params)).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getProjectAccess.mockResolvedValue(null);
    expect(
      (await POST(request({ question: "Question?" }), params)).status,
    ).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects invalid and oversized questions without calling the model", async () => {
    expect((await POST(request({ question: " " }), params)).status).toBe(400);
    const oversized = new Request(
      `http://localhost/api/projects/${projectId}/documents/${itemId}/analyze`,
      {
        method: "POST",
        headers: { Origin: "http://localhost", "Content-Length": "9000" },
      },
    );
    expect((await POST(oversized, params)).status).toBe(413);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("bounds JSON bodies when Content-Length is absent", async () => {
    const request = new Request(
      `http://localhost/api/projects/${projectId}/documents/${itemId}/analyze`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: new Uint8Array(9 * 1024),
      },
    );
    expect((await POST(request, params)).status).toBe(413);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("does not invoke the model when the document is outside current project scope", async () => {
    mocks.select.mockReturnValue(builder(null));
    expect(
      (await POST(request({ question: "Question?" }), params)).status,
    ).toBe(404);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
