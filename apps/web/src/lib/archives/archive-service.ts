import "server-only";

import { pgDb } from "@/lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  VoidAgentArchiveItemTable,
  VoidAgentArchiveTable,
} from "@/lib/db/pg/schema.pg";
import type {
  Archive,
  ArchiveWithItemCount,
  ArchivedThread,
} from "@/types/archive";
import { and, count, desc, eq, max } from "drizzle-orm";

export type ArchiveInput = {
  userId: string;
  name: string;
  description?: string | null;
};

export async function listOwnedArchives(
  userId: string,
): Promise<ArchiveWithItemCount[]> {
  const rows = await pgDb
    .select({
      id: VoidAgentArchiveTable.id,
      name: VoidAgentArchiveTable.name,
      description: VoidAgentArchiveTable.description,
      userId: VoidAgentArchiveTable.userId,
      createdAt: VoidAgentArchiveTable.createdAt,
      updatedAt: VoidAgentArchiveTable.updatedAt,
      itemCount: count(VoidAgentArchiveItemTable.id),
    })
    .from(VoidAgentArchiveTable)
    .leftJoin(
      VoidAgentArchiveItemTable,
      and(
        eq(VoidAgentArchiveItemTable.archiveId, VoidAgentArchiveTable.id),
        eq(VoidAgentArchiveItemTable.userId, userId),
      ),
    )
    .where(eq(VoidAgentArchiveTable.userId, userId))
    .groupBy(VoidAgentArchiveTable.id)
    .orderBy(desc(VoidAgentArchiveTable.updatedAt));

  return rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) }));
}

export async function createOwnedArchive(
  input: ArchiveInput,
): Promise<Archive> {
  const [archive] = await pgDb
    .insert(VoidAgentArchiveTable)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description?.trim() || null,
    })
    .returning();
  return archive;
}

export async function getOwnedArchive(
  id: string,
  userId: string,
): Promise<Archive | null> {
  const [archive] = await pgDb
    .select()
    .from(VoidAgentArchiveTable)
    .where(
      and(
        eq(VoidAgentArchiveTable.id, id),
        eq(VoidAgentArchiveTable.userId, userId),
      ),
    )
    .limit(1);
  return archive ?? null;
}

export async function updateOwnedArchive(
  id: string,
  userId: string,
  patch: { name?: string; description?: string },
): Promise<Archive | null> {
  const values: {
    name?: string;
    description?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined)
    values.description = patch.description || null;

  const [archive] = await pgDb
    .update(VoidAgentArchiveTable)
    .set(values)
    .where(
      and(
        eq(VoidAgentArchiveTable.id, id),
        eq(VoidAgentArchiveTable.userId, userId),
      ),
    )
    .returning();
  return archive ?? null;
}

export async function deleteOwnedArchive(
  id: string,
  userId: string,
): Promise<boolean> {
  const [deleted] = await pgDb
    .delete(VoidAgentArchiveTable)
    .where(
      and(
        eq(VoidAgentArchiveTable.id, id),
        eq(VoidAgentArchiveTable.userId, userId),
      ),
    )
    .returning({ id: VoidAgentArchiveTable.id });
  return Boolean(deleted);
}

export async function listOwnedArchiveThreads(
  archiveId: string,
  userId: string,
): Promise<ArchivedThread[] | null> {
  const archive = await getOwnedArchive(archiveId, userId);
  if (!archive) return null;

  const rows = await pgDb
    .select({
      id: ChatThreadTable.id,
      title: ChatThreadTable.title,
      createdAt: ChatThreadTable.createdAt,
      lastMessageAt: max(ChatMessageTable.createdAt),
    })
    .from(VoidAgentArchiveItemTable)
    .innerJoin(
      ChatThreadTable,
      and(
        eq(ChatThreadTable.id, VoidAgentArchiveItemTable.itemId),
        eq(ChatThreadTable.userId, userId),
      ),
    )
    .leftJoin(
      ChatMessageTable,
      eq(ChatMessageTable.threadId, ChatThreadTable.id),
    )
    .where(
      and(
        eq(VoidAgentArchiveItemTable.archiveId, archiveId),
        eq(VoidAgentArchiveItemTable.userId, userId),
      ),
    )
    .groupBy(ChatThreadTable.id)
    .orderBy(
      desc(max(ChatMessageTable.createdAt)),
      desc(ChatThreadTable.createdAt),
    );

  return rows.map((row) => ({
    ...row,
    lastMessageAt: row.lastMessageAt?.getTime() ?? null,
  }));
}

/**
 * Add only a thread owned by the caller to a caller-owned archive. The checks,
 * insertion, and unique-conflict lookup are in one transaction; the composite
 * archive-owner FK is also enforced by PostgreSQL.
 */
export async function addOwnedThreadToArchive(input: {
  archiveId: string;
  threadId: string;
  userId: string;
}): Promise<{
  id: string;
  archiveId: string;
  itemId: string;
  addedAt: Date;
} | null> {
  return pgDb.transaction(async (tx) => {
    const [archive] = await tx
      .select({ id: VoidAgentArchiveTable.id })
      .from(VoidAgentArchiveTable)
      .where(
        and(
          eq(VoidAgentArchiveTable.id, input.archiveId),
          eq(VoidAgentArchiveTable.userId, input.userId),
        ),
      )
      .limit(1);
    if (!archive) return null;

    const [thread] = await tx
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, input.threadId),
          eq(ChatThreadTable.userId, input.userId),
        ),
      )
      .limit(1);
    if (!thread) return null;

    const [inserted] = await tx
      .insert(VoidAgentArchiveItemTable)
      .values({
        archiveId: input.archiveId,
        itemId: input.threadId,
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [
          VoidAgentArchiveItemTable.archiveId,
          VoidAgentArchiveItemTable.itemId,
        ],
      })
      .returning({
        id: VoidAgentArchiveItemTable.id,
        archiveId: VoidAgentArchiveItemTable.archiveId,
        itemId: VoidAgentArchiveItemTable.itemId,
        addedAt: VoidAgentArchiveItemTable.addedAt,
      });

    if (inserted) return inserted;

    const [existing] = await tx
      .select({
        id: VoidAgentArchiveItemTable.id,
        archiveId: VoidAgentArchiveItemTable.archiveId,
        itemId: VoidAgentArchiveItemTable.itemId,
        addedAt: VoidAgentArchiveItemTable.addedAt,
      })
      .from(VoidAgentArchiveItemTable)
      .where(
        and(
          eq(VoidAgentArchiveItemTable.archiveId, input.archiveId),
          eq(VoidAgentArchiveItemTable.itemId, input.threadId),
          eq(VoidAgentArchiveItemTable.userId, input.userId),
        ),
      )
      .limit(1);
    return existing ?? null;
  });
}

export async function removeOwnedThreadFromArchive(input: {
  archiveId: string;
  threadId: string;
  userId: string;
}): Promise<boolean> {
  const [deleted] = await pgDb
    .delete(VoidAgentArchiveItemTable)
    .where(
      and(
        eq(VoidAgentArchiveItemTable.archiveId, input.archiveId),
        eq(VoidAgentArchiveItemTable.itemId, input.threadId),
        eq(VoidAgentArchiveItemTable.userId, input.userId),
      ),
    )
    .returning({ id: VoidAgentArchiveItemTable.id });
  return Boolean(deleted);
}
