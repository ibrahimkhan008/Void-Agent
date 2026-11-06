/**
 * Brain data may come from current project members' attached personal
 * collections or the creator of an explicitly attached same-team collection.
 * The caller remains responsible for restricting collection IDs and requiring
 * current project access.
 */
export function mergeProjectCollectionSourceOwnerIds(
  currentProjectMemberIds: string[],
  attachedTeamCollectionOwnerIds: string[],
) {
  return [
    ...new Set([...currentProjectMemberIds, ...attachedTeamCollectionOwnerIds]),
  ];
}
