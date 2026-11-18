import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, selectMock, seedRows, revisionRows } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  seedRows: [] as Array<Record<string, unknown>>,
  revisionRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { insert: insertMock, select: selectMock },
}));

const { PROJECT_RECORDS, listProjectRecords } = await import(
  "./project-records-repository.pg"
);

describe("project record seeding", () => {
  beforeEach(() => {
    seedRows.length = 0;
    revisionRows.length = 0;
    selectMock.mockReset();
    insertMock.mockReset();

    selectMock.mockImplementation((selection: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const keys = Object.keys(selection);
            if (keys.includes("content")) {
              return [
                {
                  content: "# seeded record",
                  updatedAt: new Date("2026-11-18T00:00:00Z"),
                  includeInContext: true,
                },
              ];
            }
            if (keys.includes("revision")) return [{ revision: 1 }];
            return [];
          },
          orderBy: () => ({ limit: async () => [{ revision: 1 }] }),
        }),
      }),
    }));

    insertMock.mockImplementation(() => ({
      values: (row: Record<string, unknown>) => {
        if (typeof row.slug === "string") {
          seedRows.push(row);
          return { returning: async () => [{ id: `page:${row.slug}` }] };
        }
        revisionRows.push(row);
        return Promise.resolve();
      },
    }));
  });

  it("seeds BOUNDARIES.md with its initial revision and returns it to the UI", async () => {
    const records = await listProjectRecords("project-1", "user-1");
    const definition = PROJECT_RECORDS.find(
      (record) => record.slug === "records/boundaries",
    );
    const seeded = seedRows.find((row) => row.slug === "records/boundaries");
    const firstRevision = revisionRows.find(
      (row) => row.pageId === "page:records/boundaries",
    );
    const returned = records.find(
      (record) => record.slug === "records/boundaries",
    );

    expect(definition).toBeDefined();
    expect(seedRows).toHaveLength(PROJECT_RECORDS.length);
    expect(seeded).toMatchObject({
      title: "BOUNDARIES.md",
      compiledTruth: definition?.template,
      summary: expect.stringContaining("out-of-bounds"),
    });
    expect(firstRevision).toMatchObject({
      content: definition?.template,
      revision: 1,
      changeNote: "Record created",
    });
    expect(returned).toMatchObject({
      title: "BOUNDARIES.md",
      content: "# seeded record",
      revision: 1,
    });
  });
});
