import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  owners: vi.fn(),
  context: vi.fn(),
  select: vi.fn(),
  predicate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.access,
  getProjectCollectionSourceOwnerIds: mocks.owners,
}));
vi.mock("lib/projects/project-brain-status", () => ({
  loadProjectBrainStatusContext: mocks.context,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { createProjectStatusTool } from "./project-status";

const project = {
  id: "project-1",
  name: "Release",
  collectionIds: ["collection-current"],
};

const access = { project, role: "viewer" };

const context = {
  inputFingerprint: "a".repeat(64),
  input: {
    acceptedTasks: [
      {
        id: "task-1",
        source: "plan.md",
        title: "Publish release",
        details: "Publish the final notes.",
        evidence: "Release notes are ready.",
        dueDate: "2026-02-01",
      },
    ],
    acceptedTimelineEvents: [
      {
        id: "event-1",
        source: "release.md",
        date: "2026-01-31",
        summary: "Release approved",
        detail: "",
        evidence: "The release is approved.",
      },
    ],
  },
};

const makeQuery = (rows: unknown[]) => {
  const builder = {
    from: () => builder,
    where: (predicate: unknown) => {
      mocks.predicate(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: async () => rows,
  };
  return builder;
};

const makeTool = () =>
  createProjectStatusTool({
    userId: "user-1",
    projectId: "project-1",
    collectionIds: ["collection-old", "collection-current"],
  }) as unknown as { execute: () => Promise<Record<string, any>> };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(access);
  mocks.owners.mockResolvedValue(["user-1"]);
  mocks.context.mockResolvedValue(context);
  mocks.select.mockReturnValue(
    makeQuery([
      {
        health: "yellow",
        progressPct: 75,
        summary: "Final review is underway.",
        blockers: ["Approve release notes", 5],
        createdAt: new Date("2026-01-31T12:00:00Z"),
      },
    ]),
  );
});

describe("project status chat tool", () => {
  it("returns bounded status, accepted tasks and recent events for current project scope", async () => {
    const result = await makeTool().execute();

    expect(result).toEqual({
      success: true,
      project: { id: "project-1", name: "Release" },
      status: {
        health: "yellow",
        progressPct: 75,
        summary: "Final review is underway.",
        blockers: ["Approve release notes"],
        generatedAt: "2026-01-31T12:00:00.000Z",
      },
      acceptedTasks: [
        {
          title: "Publish release",
          details: "Publish the final notes.",
          dueDate: "2026-02-01",
          status: "accepted",
        },
      ],
      recentEvents: [{ date: "2026-01-31", title: "Release approved" }],
    });
    expect(mocks.access).toHaveBeenCalledWith("project-1", "user-1");
    expect(mocks.owners).toHaveBeenCalledWith(access);
    expect(mocks.context).toHaveBeenCalledWith({
      project,
      collectionIds: ["collection-current"],
      ownerIds: ["user-1"],
    });
    const where = new PgDialect().sqlToQuery(
      mocks.predicate.mock.calls[0]?.[0],
    );
    expect(where.sql).toContain('"project_brain_status_snapshot"."project_id"');
    expect(where.sql).toContain(
      '"project_brain_status_snapshot"."input_fingerprint"',
    );
    expect(where.params).toEqual(["project-1", "a".repeat(64)]);
  });

  it("does not read status for a project the user can no longer access", async () => {
    mocks.access.mockResolvedValueOnce(null);

    await expect(makeTool().execute()).resolves.toEqual({
      success: false,
      error: "This project is no longer available to you.",
    });
    expect(mocks.owners).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns tasks/events without fabricating a status when no snapshot exists", async () => {
    mocks.select.mockReturnValueOnce(makeQuery([]));

    const result = await makeTool().execute();

    expect(result.status).toBeNull();
    expect(result.acceptedTasks).toHaveLength(1);
    expect(result.recentEvents).toHaveLength(1);
    expect(result.note).toBe("No current status snapshot is available.");
  });

  it("keeps knowledge visible without querying snapshots when no current source context exists", async () => {
    mocks.context.mockResolvedValueOnce(null);

    const result = await makeTool().execute();

    expect(result.status).toBeNull();
    expect(result.acceptedTasks).toEqual([]);
    expect(result.recentEvents).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
