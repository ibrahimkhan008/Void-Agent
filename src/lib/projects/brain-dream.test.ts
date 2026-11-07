import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pages: [] as Array<Array<{ projectId: string; userId: string }>>,
  selectedTables: [] as unknown[],
  whereConditions: [] as Array<{
    op: string;
    conditions?: unknown[];
    args?: unknown[];
  }>,
  inserted: 0,
  getProjectAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ op: "and", conditions }),
    eq: (...args: unknown[]) => ({ op: "eq", args }),
    gt: (...args: unknown[]) => ({ op: "gt", args }),
    notExists: (value: unknown) => ({ op: "notExists", args: [value] }),
  };
});

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    selectDistinctOn: vi.fn(() => ({
      from: (table: unknown) => {
        mocks.selectedTables.push(table);
        return {
          where: (condition: { op: string; conditions?: unknown[] }) => {
            mocks.whereConditions.push(condition);
            return {
              orderBy: () => ({
                limit: async () => mocks.pages.shift() ?? [],
              }),
            };
          },
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({ where: () => ({}) }),
    })),
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ id: `dream-${++mocks.inserted}` }],
        }),
      }),
    })),
  },
}));

vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: vi.fn(),
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/notifications/project-health", () => ({
  notifyProjectHealthTransition: vi.fn(),
}));
vi.mock("lib/projects/brain-contradictions", () => ({
  findProjectBrainConflictCandidates: vi.fn(),
  judgeProjectBrainConflictCandidates: vi.fn(),
}));
vi.mock("lib/projects/brain-page-archive", () => ({
  MAX_STALE_PAGE_ARCHIVES_PER_PASS: 20,
  archiveStaleProjectBrainPage: vi.fn(),
  listStaleProjectBrainPages: vi.fn(),
}));
vi.mock("lib/projects/brain-page-duplicate-candidates", () => ({
  findBrainPageDuplicateCandidates: vi.fn(),
  judgeBrainPageDuplicateCandidates: vi.fn(),
}));
vi.mock("lib/projects/brain-source-state", () => ({
  projectBrainRunIsActiveSourceRevision: vi.fn(),
}));
vi.mock("lib/projects/project-brain-status", () => ({
  generateProjectBrainStatus: vi.fn(),
  loadProjectBrainStatusContext: vi.fn(),
}));
vi.mock("lib/projects/recompute-brain-salience", () => ({
  recomputeProjectBrainSalience: vi.fn(),
}));

import { ProjectBrainRunTable } from "lib/db/pg/schema.pg";
import { enqueueNightlyProjectBrainDreams } from "./brain-dream";

function projectCandidates(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => ({
    projectId: `project-${String(start + offset).padStart(3, "0")}`,
    userId: `owner-${start + offset}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pages = [projectCandidates(0, 100), projectCandidates(100, 2), []];
  mocks.selectedTables = [];
  mocks.whereConditions = [];
  mocks.inserted = 0;
  mocks.getProjectAccess.mockImplementation(async (projectId: string) =>
    projectId === "project-000" ? null : { role: "owner" },
  );
});

describe("nightly project brain dream scheduling", () => {
  it("pages source ingest runs past 100 projects and does not require fact rows", async () => {
    const now = new Date("2026-11-07T12:00:00.000Z");
    const result = await enqueueNightlyProjectBrainDreams(now);

    expect(result).toEqual({ queued: 101 });
    expect(mocks.selectedTables).toEqual([
      ProjectBrainRunTable,
      ProjectBrainRunTable,
      ProjectBrainRunTable,
    ]);
    expect(mocks.pages).toEqual([]);
    expect(mocks.getProjectAccess).toHaveBeenCalledTimes(102);
    expect(mocks.whereConditions).toHaveLength(3);

    const firstPagePredicates = mocks.whereConditions[0].conditions ?? [];
    expect(firstPagePredicates).toContainEqual({
      op: "eq",
      args: [ProjectBrainRunTable.status, "succeeded"],
    });
    expect(firstPagePredicates).toContainEqual({
      op: "gt",
      args: [
        ProjectBrainRunTable.updatedAt,
        new Date("2026-11-06T12:00:00.000Z"),
      ],
    });

    const secondPagePredicates = mocks.whereConditions[1].conditions ?? [];
    expect(secondPagePredicates).toContainEqual({
      op: "gt",
      args: [ProjectBrainRunTable.projectId, "project-099"],
    });
  });
});
