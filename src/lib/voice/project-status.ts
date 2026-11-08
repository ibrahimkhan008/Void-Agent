import "server-only";

import { chatRepository } from "lib/db/repository";
import { getProjectAccess, listProjectsForUser } from "lib/projects/access";
import { z } from "zod";

const threadIdSchema = z.string().uuid();
const projectIdSchema = z.string().uuid();

/** Resolve a caller-selected project only from their current accessible set. */
export async function getAccessibleProjectStatusScope(
  userId: string,
  selector: { projectId?: unknown; projectName?: unknown },
) {
  const projectId = projectIdSchema.safeParse(selector.projectId);
  let candidateId: string | undefined;
  if (projectId.success) {
    candidateId = projectId.data;
  } else if (typeof selector.projectName === "string") {
    const needle = selector.projectName.trim().toLowerCase();
    if (!needle || needle.length > 200) return null;
    const candidates = await listProjectsForUser(userId);
    const exactMatches = candidates.filter(
      (project) => project.name.trim().toLowerCase() === needle,
    );
    if (exactMatches.length !== 1) return null;
    candidateId = exactMatches[0].id;
  }
  if (!candidateId) return null;

  // Re-check access after resolving names/IDs to close the list-to-read race.
  const access = await getProjectAccess(candidateId, userId);
  if (!access) return null;
  return {
    projectId: access.project.id,
    collectionIds: access.project.collectionIds,
  };
}

/** Resolve project context only from a thread owned by the authenticated user. */
export async function getOwnedProjectThreadScope(
  userId: string,
  rawThreadId: unknown,
) {
  const parsedThreadId = threadIdSchema.safeParse(rawThreadId);
  if (!parsedThreadId.success) return null;

  const thread = await chatRepository.selectThread(parsedThreadId.data);
  if (thread?.userId !== userId || !thread.projectId) return null;

  const access = await getProjectAccess(thread.projectId, userId);
  if (!access) return null;

  const threadCollectionIds = Array.isArray(thread.collectionIds)
    ? thread.collectionIds
    : [];
  return {
    projectId: access.project.id,
    collectionIds: threadCollectionIds.filter((id) =>
      access.project.collectionIds.includes(id),
    ),
  };
}
