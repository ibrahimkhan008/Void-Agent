import { ChatMessage, ChatRepository, ChatThread } from "app-types/chat";

import { pgDb as db } from "../db.pg";
import {
  ArchiveItemTable,
  ChatMessageTable,
  ChatThreadTable,
  UserTable,
} from "../schema.pg";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { MAX_CONVERSATION_ARCHIVE_MESSAGES } from "lib/chat/conversation-archive";
import {
  ForkSnapshotLimitError,
  MAX_FORK_MESSAGES,
  exceedsForkSnapshotLimits,
} from "lib/chat/fork-limits";
import { CHAT_MESSAGE_WINDOW } from "lib/const";

export const pgChatRepository: ChatRepository = {
  insertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = (await db
      .insert(ChatThreadTable)
      .values({
        title: thread.title,
        userId: thread.userId,
        id: thread.id,
        orgId: thread.orgId ?? null,
        collectionIds: thread.collectionIds,
        projectId: thread.projectId,
      })
      .returning()) as ChatThread[];
    return result;
  },

  deleteChatMessage: async (id: string, userId: string): Promise<boolean> => {
    const deleted = await db
      .delete(ChatMessageTable)
      .where(
        and(
          eq(ChatMessageTable.id, id),
          inArray(
            ChatMessageTable.threadId,
            db
              .select({ id: ChatThreadTable.id })
              .from(ChatThreadTable)
              .where(eq(ChatThreadTable.userId, userId)),
          ),
        ),
      )
      .returning({ id: ChatMessageTable.id });
    return deleted.length > 0;
  },

  selectMessage: async (id: string): Promise<ChatMessage | null> => {
    const [result] = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.id, id));
    if (!result) return null;

    return {
      ...result,
      parts: result.parts ?? [],
      metadata: result.metadata ?? undefined,
    } as ChatMessage;
  },

  selectThread: async (id: string): Promise<ChatThread | null> => {
    const [result] = (await db
      .select()
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, id))) as ChatThread[];
    return result ?? null;
  },

  selectThreadDetails: async (id: string) => {
    if (!id) {
      return null;
    }
    const [thread] = await db
      .select()
      .from(ChatThreadTable)
      .leftJoin(UserTable, eq(ChatThreadTable.userId, UserTable.id))
      .where(eq(ChatThreadTable.id, id));

    if (!thread) {
      return null;
    }

    const messages = await pgChatRepository.selectMessagesByThreadId(id);
    return {
      id: thread.chat_thread.id,
      title: thread.chat_thread.title,
      userId: thread.chat_thread.userId,
      createdAt: thread.chat_thread.createdAt,
      orgId: thread.chat_thread.orgId,
      collectionIds: thread.chat_thread.collectionIds,
      projectId: thread.chat_thread.projectId,
      userPreferences: thread.user?.preferences ?? undefined,
      messages,
    };
  },

  selectMessagesByThreadId: async (
    threadId: string,
    opts?: { limit?: number; beforeMessageId?: string },
  ): Promise<ChatMessage[]> => {
    const { limit, beforeMessageId } = opts ?? {};
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
      return [];
    }

    const baseFilter = eq(ChatMessageTable.threadId, threadId);
    // Keep timestamp comparison inside Postgres. Converting the cursor to a JS
    // Date loses sub-millisecond precision and can skip rows at page edges.
    const cursorTimestamp = beforeMessageId
      ? sql`(select ${ChatMessageTable.createdAt} from ${ChatMessageTable} where ${ChatMessageTable.id} = ${beforeMessageId} and ${ChatMessageTable.threadId} = ${threadId})`
      : undefined;
    const beforeFilter =
      beforeMessageId && cursorTimestamp
        ? or(
            lt(ChatMessageTable.createdAt, cursorTimestamp),
            and(
              eq(ChatMessageTable.createdAt, cursorTimestamp),
              lt(ChatMessageTable.id, beforeMessageId),
            ),
          )
        : undefined;
    const filter = beforeFilter ? and(baseFilter, beforeFilter) : baseFilter;

    if (!limit) {
      const result = await db
        .select()
        .from(ChatMessageTable)
        .where(filter)
        .orderBy(asc(ChatMessageTable.createdAt), asc(ChatMessageTable.id));
      return result as ChatMessage[];
    }

    const result = await db
      .select()
      .from(ChatMessageTable)
      .where(filter)
      .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
      .limit(Math.min(limit, CHAT_MESSAGE_WINDOW));
    return (result as ChatMessage[]).reverse();
  },

  selectMessagesForExport: async (
    threadId: string,
    limit: number,
  ): Promise<ChatMessage[]> => {
    if (!Number.isSafeInteger(limit) || limit <= 0) return [];
    const result = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.threadId, threadId))
      .orderBy(asc(ChatMessageTable.createdAt), asc(ChatMessageTable.id))
      .limit(Math.min(limit, MAX_CONVERSATION_ARCHIVE_MESSAGES + 1));
    return result as ChatMessage[];
  },

  // Most recent chatModel used by the user (from the last message that
  // carries one), so the scheduler worker can trigger runs with the same
  // model the user chats with instead of the generic fallback.
  selectLatestChatModelByUserId: async (
    userId: string,
  ): Promise<{ provider: string; model: string } | null> => {
    const result = await db
      .select({
        metadata: ChatMessageTable.metadata,
      })
      .from(ChatMessageTable)
      .innerJoin(
        ChatThreadTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(eq(ChatThreadTable.userId, userId))
      .orderBy(desc(ChatMessageTable.createdAt))
      .limit(30);
    for (const row of result) {
      const model = (
        row.metadata as {
          chatModel?: { provider?: string; model?: string };
        } | null
      )?.chatModel;
      if (model?.provider && model?.model) {
        return { provider: model.provider, model: model.model };
      }
    }
    return null;
  },

  selectThreadsByUserId: async (
    userId: string,
  ): Promise<
    (ChatThread & {
      lastMessageAt: number;
    })[]
  > => {
    const threadWithLatestMessage = await db
      .select({
        threadId: ChatThreadTable.id,
        title: ChatThreadTable.title,
        createdAt: ChatThreadTable.createdAt,
        userId: ChatThreadTable.userId,
        lastMessageAt: sql<string>`MAX(${ChatMessageTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(ChatThreadTable)
      .leftJoin(
        ChatMessageTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(eq(ChatThreadTable.userId, userId))
      .groupBy(ChatThreadTable.id)
      .orderBy(desc(sql`last_message_at`));

    return threadWithLatestMessage.map((row) => {
      return {
        id: row.threadId,
        title: row.title,
        userId: row.userId,
        createdAt: row.createdAt,
        lastMessageAt: row.lastMessageAt
          ? new Date(row.lastMessageAt).getTime()
          : 0,
      };
    });
  },

  updateThread: async (
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread> => {
    const [result] = (await db
      .update(ChatThreadTable)
      .set({
        title: thread.title,
        ...(thread.collectionIds !== undefined
          ? { collectionIds: thread.collectionIds }
          : {}),
        ...(thread.projectId !== undefined
          ? { projectId: thread.projectId }
          : {}),
      })
      .where(eq(ChatThreadTable.id, id))
      .returning()) as ChatThread[];
    return result;
  },
  upsertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const values = {
      ...thread,
      ...(thread.decisions
        ? {
            decisions: thread.decisions.map((decision) => ({
              text: decision.text,
              at:
                "at" in decision && typeof decision.at === "string"
                  ? decision.at
                  : new Date().toISOString(),
            })),
          }
        : {}),
    };
    const [result] = (await db
      .insert(ChatThreadTable)
      .values(values as typeof ChatThreadTable.$inferInsert)
      .onConflictDoUpdate({
        target: [ChatThreadTable.id],
        set: {
          title: thread.title,
        },
        // Multi-tenant guard: never let a conflicting id overwrite another
        // user's thread title. Without this predicate the PK-only conflict
        // target made the UPDATE fire regardless of ownership (IDOR write).
        setWhere: eq(ChatThreadTable.userId, thread.userId),
      })
      .returning()) as ChatThread[];
    if (!result) {
      throw new Error("Thread not found or not owned by caller");
    }
    return result;
  },

  setThreadTitleIfEmpty: async (
    id: string,
    title: string,
    userId: string,
  ): Promise<string | null> => {
    const [updated] = (await db
      .insert(ChatThreadTable)
      .values({ id, title, userId })
      .onConflictDoUpdate({
        target: [ChatThreadTable.id],
        set: { title },
        // The title endpoint may race the chat route or another title request.
        // Only fill a blank title belonging to this user; never replace a title
        // that another request or the user has already written.
        setWhere: and(
          eq(ChatThreadTable.userId, userId),
          eq(ChatThreadTable.title, ""),
        ),
      })
      .returning({ title: ChatThreadTable.title })) as Array<{ title: string }>;
    if (updated) return updated.title;

    const [existing] = await db
      .select({ title: ChatThreadTable.title })
      .from(ChatThreadTable)
      .where(
        and(eq(ChatThreadTable.id, id), eq(ChatThreadTable.userId, userId)),
      )
      .limit(1);
    return existing?.title ?? null;
  },

  deleteThread: async (id: string): Promise<void> => {
    // 1. Delete all messages in the thread
    await db.delete(ChatMessageTable).where(eq(ChatMessageTable.threadId, id));

    // 2. Remove thread from all archives
    await db.delete(ArchiveItemTable).where(eq(ArchiveItemTable.itemId, id));

    // 3. Delete the thread itself
    await db.delete(ChatThreadTable).where(eq(ChatThreadTable.id, id));
  },

  insertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    const entity = {
      ...message,
      id: message.id,
    };
    const [result] = await db
      .insert(ChatMessageTable)
      .values(entity)
      .returning();
    return result as ChatMessage;
  },

  upsertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    const result = await db
      .insert(ChatMessageTable)
      .values(message)
      .onConflictDoUpdate({
        target: [ChatMessageTable.id],
        set: {
          parts: message.parts,
          metadata: message.metadata,
        },
      })
      .returning();
    return result[0] as ChatMessage;
  },

  deleteMessagesByChatIdAfterTimestamp: async (
    messageId: string,
    userId: string,
  ): Promise<boolean> => {
    // Keep the cursor comparison inside PostgreSQL. JS Date conversion can
    // lose timestamp precision; tie-break with id, matching history ordering.
    const targetThreadId = sql`(select ${ChatMessageTable.threadId} from ${ChatMessageTable} where ${ChatMessageTable.id} = ${messageId})`;
    const targetCreatedAt = sql`(select ${ChatMessageTable.createdAt} from ${ChatMessageTable} where ${ChatMessageTable.id} = ${messageId})`;
    const laterThanTarget = or(
      gt(ChatMessageTable.createdAt, targetCreatedAt),
      and(
        eq(ChatMessageTable.createdAt, targetCreatedAt),
        gte(ChatMessageTable.id, messageId),
      ),
    );
    const deleted = await db
      .delete(ChatMessageTable)
      .where(
        and(
          eq(ChatMessageTable.threadId, targetThreadId),
          laterThanTarget,
          inArray(
            ChatMessageTable.threadId,
            db
              .select({ id: ChatThreadTable.id })
              .from(ChatThreadTable)
              .where(eq(ChatThreadTable.userId, userId)),
          ),
        ),
      )
      .returning({ id: ChatMessageTable.id });
    return deleted.length > 0;
  },

  deleteAllThreads: async (userId: string): Promise<void> => {
    const threadIds = await db
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.userId, userId));
    await Promise.all(
      threadIds.map((threadId) => pgChatRepository.deleteThread(threadId.id)),
    );
  },

  deleteUnarchivedThreads: async (userId: string): Promise<void> => {
    const unarchivedThreadIds = await db
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .leftJoin(
        ArchiveItemTable,
        eq(ChatThreadTable.id, ArchiveItemTable.itemId),
      )
      .where(
        and(
          eq(ChatThreadTable.userId, userId),
          sql`${ArchiveItemTable.id} IS NULL`,
        ),
      );

    await Promise.all(
      unarchivedThreadIds.map((threadId) =>
        pgChatRepository.deleteThread(threadId.id),
      ),
    );
  },

  insertMessages: async (
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]> => {
    const result = await db
      .insert(ChatMessageTable)
      .values(messages)
      .returning();
    return result as ChatMessage[];
  },

  checkAccess: async (id: string, userId: string): Promise<boolean> => {
    const [result] = await db
      .select({
        userId: ChatThreadTable.userId,
      })
      .from(ChatThreadTable)
      .where(
        and(eq(ChatThreadTable.id, id), eq(ChatThreadTable.userId, userId)),
      );
    return Boolean(result);
  },

  forkThread: async (
    { sourceThreadId, forkFromMessageId, branchLabel },
    userId,
  ): Promise<ChatThread> => {
    return db.transaction(async (tx) => {
      // Recheck ownership inside the transaction after the route's ACL checks.
      const [sourceThread] = (await tx
        .select()
        .from(ChatThreadTable)
        .where(
          and(
            eq(ChatThreadTable.id, sourceThreadId),
            eq(ChatThreadTable.userId, userId),
          ),
        )
        .for("share")
        .limit(1)) as ChatThread[];
      if (!sourceThread) {
        throw new Error("Source thread not found or access denied");
      }

      const [forkPoint] = await tx
        .select({ id: ChatMessageTable.id })
        .from(ChatMessageTable)
        .where(
          and(
            eq(ChatMessageTable.id, forkFromMessageId),
            eq(ChatMessageTable.threadId, sourceThreadId),
          ),
        )
        .limit(1);
      if (!forkPoint) {
        throw new Error("Fork message not found in source thread");
      }

      // Compare against the fork point in SQL to preserve PostgreSQL's
      // microsecond timestamp precision. The ID tie-breaker matches history
      // ordering when multiple messages have the same timestamp.
      const prefixCondition = sql`(${ChatMessageTable.createdAt}, ${ChatMessageTable.id}) <= (
        SELECT ${ChatMessageTable.createdAt}, ${ChatMessageTable.id}
        FROM ${ChatMessageTable}
        WHERE ${ChatMessageTable.id} = ${forkFromMessageId}
          AND ${ChatMessageTable.threadId} = ${sourceThreadId}
      )`;
      const [bounds] = await tx
        .select({
          messageCount: count(),
          contentBytes:
            sql<number>`coalesce(sum(octet_length(${ChatMessageTable.parts}::text)), 0)`.mapWith(
              Number,
            ),
        })
        .from(ChatMessageTable)
        .where(
          and(eq(ChatMessageTable.threadId, sourceThreadId), prefixCondition),
        );

      if (
        exceedsForkSnapshotLimits({
          messageCount: bounds?.messageCount ?? 0,
          contentBytes: bounds?.contentBytes ?? 0,
        })
      ) {
        throw new ForkSnapshotLimitError();
      }

      const sourceMessages = (await tx
        .select()
        .from(ChatMessageTable)
        .where(
          and(eq(ChatMessageTable.threadId, sourceThreadId), prefixCondition),
        )
        .orderBy(asc(ChatMessageTable.createdAt), asc(ChatMessageTable.id))
        .limit(MAX_FORK_MESSAGES + 1)) as ChatMessage[];
      if (sourceMessages.length > MAX_FORK_MESSAGES) {
        throw new ForkSnapshotLimitError();
      }

      // Copy the thread and messages atomically, preserving project/team/model
      // scope. A failed bulk message insert rolls back the branch metadata too.
      const newThreadId = randomUUID();
      const newTitle = branchLabel
        ? `${sourceThread.title} (${branchLabel})`
        : `${sourceThread.title} (branch)`;
      const [createdThread] = (await tx
        .insert(ChatThreadTable)
        .values({
          id: newThreadId,
          title: newTitle,
          userId,
          orgId: sourceThread.orgId,
          routingModelProvider: sourceThread.routingModelProvider,
          routingModel: sourceThread.routingModel,
          projectId: sourceThread.projectId,
          collectionIds: sourceThread.collectionIds,
          parentThreadId: sourceThreadId,
          forkFromMessageId,
          branchLabel: branchLabel ?? null,
        })
        .returning()) as ChatThread[];
      if (!createdThread) {
        throw new Error("Failed to create forked thread");
      }

      const clonedMessages: Omit<ChatMessage, "createdAt">[] =
        sourceMessages.map((msg) => ({
          id: randomUUID(),
          threadId: newThreadId,
          orgId: sourceThread.orgId,
          role: msg.role,
          parts: msg.parts,
          ...(msg.metadata
            ? {
                metadata: {
                  ...msg.metadata,
                  usage: undefined,
                },
              }
            : {}),
        }));
      if (clonedMessages.length > 0) {
        await tx.insert(ChatMessageTable).values(clonedMessages);
      }
      return createdThread;
    });
  },
  updateThreadInsights: async (
    threadId,
    userId,
    insights,
  ): Promise<ChatThread | null> => {
    // 1. Verify ownership. We re-check here as defence in depth — the
    //    route also calls `checkAccess` first, but the repository is
    //    the only place that can guarantee we never write insights to
    //    a thread the caller doesn't own.
    const [owner] = await db
      .select({ userId: ChatThreadTable.userId })
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      );
    if (!owner) {
      return null;
    }

    // 2. Map the LLM-friendly string lists into the schema's richer
    //    row shape. `at` is the persistence time so the UI can sort
    //    decisions chronologically. `done` defaults to false — the
    //    UI can mark items complete later.
    const now = new Date();
    const decisions = insights.decisions.map((text) => ({
      text,
      at: now.toISOString(),
    }));
    const actionItems = insights.actionItems.map((text) => ({
      text,
      done: false,
    }));

    // 3. Persist. We always overwrite the previous insights so a
    //    re-generation gives the user the freshest view.
    const [updated] = (await db
      .update(ChatThreadTable)
      .set({
        summary: insights.summary,
        decisions,
        actionItems,
        insightsGeneratedAt: now,
      })
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      )
      .returning()) as ChatThread[];

    return updated ?? null;
  },
};
