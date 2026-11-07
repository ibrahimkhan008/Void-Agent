import { describe, expect, it, vi } from "vitest";
import {
  MAX_STALE_PAGE_ARCHIVES_PER_PASS,
  type ProjectBrainMaintenanceDependencies,
  type ProjectBrainMaintenanceScope,
  runProjectBrainMaintenance,
} from "./brain-maintenance";

const scope: ProjectBrainMaintenanceScope = {
  projectId: "project-1",
  collectionIds: ["collection-1"],
  ownerIds: ["user-1"],
};

const createDependencies = (): ProjectBrainMaintenanceDependencies => ({
  recomputeSalience: vi.fn(async () => ({ updated: 3 })),
  listStalePages: vi.fn(async () => [{ id: "page-1" }, { id: "page-2" }]),
  archiveStalePage: vi.fn(async ({ pageId }) => pageId === "page-1"),
});

describe("runProjectBrainMaintenance", () => {
  it("refreshes ranking and archives only stale pages in the scoped project", async () => {
    const dependencies = createDependencies();

    const result = await runProjectBrainMaintenance(scope, dependencies);

    expect(result).toEqual({
      salienceUpdated: 3,
      stalePagesArchived: 1,
      warnings: [],
    });
    expect(dependencies.recomputeSalience).toHaveBeenCalledWith(scope);
    expect(dependencies.listStalePages).toHaveBeenCalledWith(scope);
    expect(dependencies.archiveStalePage).toHaveBeenNthCalledWith(1, {
      ...scope,
      pageId: "page-1",
    });
  });

  it("does no database work without an explicitly scoped source set", async () => {
    const dependencies = createDependencies();

    await expect(
      runProjectBrainMaintenance({ ...scope, ownerIds: [] }, dependencies),
    ).resolves.toEqual({
      salienceUpdated: 0,
      stalePagesArchived: 0,
      warnings: [],
    });
    expect(dependencies.recomputeSalience).not.toHaveBeenCalled();
    expect(dependencies.listStalePages).not.toHaveBeenCalled();
    expect(dependencies.archiveStalePage).not.toHaveBeenCalled();
  });

  it("bounds archives per queue pass and keeps progressing after one failure", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.listStalePages).mockResolvedValue(
      Array.from({ length: MAX_STALE_PAGE_ARCHIVES_PER_PASS + 5 }, (_, i) => ({
        id: `page-${i}`,
      })),
    );
    vi.mocked(dependencies.archiveStalePage)
      .mockRejectedValueOnce(new Error("temporary database error"))
      .mockResolvedValue(true);

    const result = await runProjectBrainMaintenance(scope, dependencies);

    expect(dependencies.archiveStalePage).toHaveBeenCalledTimes(
      MAX_STALE_PAGE_ARCHIVES_PER_PASS,
    );
    expect(result.stalePagesArchived).toBe(
      MAX_STALE_PAGE_ARCHIVES_PER_PASS - 1,
    );
    expect(result.warnings).toEqual(["stale-page-archive"]);
  });

  it("does not erase successful extraction when a maintenance stage fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.recomputeSalience).mockRejectedValue(
      new Error("salience unavailable"),
    );
    vi.mocked(dependencies.listStalePages).mockRejectedValue(
      new Error("source query unavailable"),
    );

    await expect(
      runProjectBrainMaintenance(scope, dependencies),
    ).resolves.toEqual({
      salienceUpdated: 0,
      stalePagesArchived: 0,
      warnings: ["salience", "stale-page-list"],
    });
    expect(dependencies.archiveStalePage).not.toHaveBeenCalled();
  });
});
