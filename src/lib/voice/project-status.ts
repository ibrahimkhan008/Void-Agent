import "server-only";

import { chatRepository } from "lib/db/repository";
import { getProjectAccess } from "lib/projects/access";
import { z } from "zod";

const threadIdSchema = z.string().uuid();

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
