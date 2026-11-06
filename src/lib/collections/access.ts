import "server-only";

import type { CollectionEntity } from "lib/db/pg/schema.pg";
import { collectionRepository } from "lib/db/repository";
import { type ProjectRole, getTeamRole } from "lib/projects/access";

export type CollectionAccess = {
  collection: CollectionEntity;
  role: ProjectRole;
};

/**
 * Re-resolve access from current team membership on every operation.
 * Personal collections remain owner-only; a non-null orgId opts a collection
 * into that team's scope and requires current membership, even for its creator.
 */
export async function getCollectionAccess(
  collectionId: string,
  userId: string,
): Promise<CollectionAccess | null> {
  const collection = await collectionRepository.getCollectionById(collectionId);
  if (!collection) return null;

  if (!collection.orgId) {
    return collection.userId === userId ? { collection, role: "owner" } : null;
  }

  const role = await getTeamRole(collection.orgId, userId);
  return role ? { collection, role } : null;
}

export function canWriteCollection(role: ProjectRole) {
  return role === "owner" || role === "editor";
}

export function canDeleteCollection(access: CollectionAccess, userId: string) {
  return access.collection.userId === userId && access.role !== "viewer";
}

export function canAttachCollectionToProject(
  access: CollectionAccess | null,
  userId: string,
  projectTeamId: string | null,
) {
  if (!access) return false;
  if (access.collection.orgId) {
    return projectTeamId === access.collection.orgId;
  }
  return access.collection.userId === userId;
}
