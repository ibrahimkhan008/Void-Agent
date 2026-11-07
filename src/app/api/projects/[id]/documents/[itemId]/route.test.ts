import { PgDialect } from "drizzle-orm/pg-core";
import { ProjectDocumentTable } from "lib/db/pg/schema.pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  hasSameOrigin: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
  predicates: [] as unknown[],
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, delete: mocks.delete },
}));

import { DELETE } from "./route";

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId], teamId: "team-1" },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([
    "member-1",
    "creator-1",
  ]);
  mocks.hasSameOrigin.mockReturnValue(true);
  mocks.select.mockReturnValue(
    builder({
      id: itemId,
      collectionId,
      collectionOwnerId: "creator-1",
    }),
  );
  mocks.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
});

describe("project document unlink API", () => {
  it("removes only an authorized, attached source link", async () => {
    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      }),
      params,
    );
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(response.status).toBe(204);
    expect(query.params).toContain(projectId);
    expect(query.params).toContain(itemId);
    expect(query.params).toContain(collectionId);
    expect(mocks.delete).toHaveBeenCalledOnce();
    // Unlinking deletes only the project mapping. Collection source bytes and
    // extracted content remain available to collections and other projects.
    expect(mocks.delete).toHaveBeenCalledWith(ProjectDocumentTable);
  });

  it("denies viewers and refuses sources outside the attached project scope", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.select.mockReturnValue(builder(null));
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(404);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("requires same-origin requests", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rechecks editor access, attachment, and source-owner scope before unlinking", async () => {
    const currentEditor = {
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    };
    mocks.getProjectAccess
      .mockResolvedValueOnce(currentEditor)
      .mockResolvedValueOnce(null);
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(404);
    expect(mocks.delete).not.toHaveBeenCalled();

    mocks.getProjectAccess
      .mockResolvedValueOnce(currentEditor)
      .mockResolvedValueOnce({
        project: { id: projectId, collectionIds: [collectionId] },
        role: "viewer",
      });
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();

    mocks.getProjectAccess
      .mockResolvedValueOnce(currentEditor)
      .mockResolvedValueOnce({
        project: { id: projectId, collectionIds: [] },
        role: "editor",
      });
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(404);
    expect(mocks.delete).not.toHaveBeenCalled();

    mocks.getProjectAccess
      .mockResolvedValueOnce(currentEditor)
      .mockResolvedValueOnce(currentEditor);
    mocks.getProjectCollectionSourceOwnerIds
      .mockResolvedValueOnce(["creator-1"])
      .mockResolvedValueOnce([]);
    expect(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          params,
        )
      ).status,
    ).toBe(404);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
