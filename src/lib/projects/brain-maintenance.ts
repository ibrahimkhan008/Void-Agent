import type { ProjectBrainPageEntity } from "lib/db/pg/schema.pg";

export type ProjectBrainMaintenanceScope = {
  projectId: string;
  collectionIds: string[];
  ownerIds: string[];
};

export type StaleProjectBrainPage = Pick<ProjectBrainPageEntity, "id">;

export type ProjectBrainMaintenanceResult = {
  salienceUpdated: number;
  stalePagesArchived: number;
  warnings: string[];
};

export type ProjectBrainMaintenanceDependencies = {
  recomputeSalience: (
    scope: ProjectBrainMaintenanceScope,
  ) => Promise<{ updated: number }>;
  listStalePages: (
    scope: ProjectBrainMaintenanceScope,
  ) => Promise<StaleProjectBrainPage[]>;
  archiveStalePage: (
    scope: ProjectBrainMaintenanceScope & { pageId: string },
  ) => Promise<boolean>;
};

/** Keep scheduler work bounded while the queue drains backlogs incrementally. */
export const MAX_STALE_PAGE_ARCHIVES_PER_PASS = 20;

/**
 * Refresh the graph ranking and archive stale pages after a successful source
 * analysis. Each database helper rechecks the live project/source scope; a
 * maintenance failure never converts the completed extraction into a failure.
 */
export async function runProjectBrainMaintenance(
  scope: ProjectBrainMaintenanceScope,
  dependencies: ProjectBrainMaintenanceDependencies,
): Promise<ProjectBrainMaintenanceResult> {
  const result: ProjectBrainMaintenanceResult = {
    salienceUpdated: 0,
    stalePagesArchived: 0,
    warnings: [],
  };
  if (!scope.collectionIds.length || !scope.ownerIds.length) return result;

  try {
    const salience = await dependencies.recomputeSalience(scope);
    result.salienceUpdated = salience.updated;
  } catch {
    result.warnings.push("salience");
  }

  let stalePages: StaleProjectBrainPage[];
  try {
    stalePages = await dependencies.listStalePages(scope);
  } catch {
    result.warnings.push("stale-page-list");
    return result;
  }

  for (const page of stalePages.slice(0, MAX_STALE_PAGE_ARCHIVES_PER_PASS)) {
    try {
      if (await dependencies.archiveStalePage({ ...scope, pageId: page.id })) {
        result.stalePagesArchived += 1;
      }
    } catch {
      result.warnings.push("stale-page-archive");
    }
  }
  return result;
}
