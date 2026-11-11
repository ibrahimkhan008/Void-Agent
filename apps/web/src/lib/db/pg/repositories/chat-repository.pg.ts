import { randomUUID } from "node:crypto";
import type { AgentKnowledgeBaseBinding } from "app-types/agent";
import { ChatMessage, ChatRepository, ChatThread } from "app-types/chat";
import { UserPreferences } from "app-types/user";

import { pgDb as db } from "../db.pg";
import { ChatMessageTable, ChatThreadTable, UserTable } from "../schema.pg";

import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { CHAT_MESSAGE_WINDOW } from "lib/const";

// A crash or function timeout mid-stream leaves a message stuck
// runStatus:"running" with no terminal state ever written. maxDuration is 300s,
// so anything still "running" past 6 min is orphaned. Flip those to failed on
// load (one bounded UPDATE over just these ids, only when any exist) so the UI
// surfaces the failure and offers Retry instead of a silently dead thread.
// Mutates the passed rows in place so callers return the repaired state without
// a second query. No reaper cron — repair happens lazily on the read path.
const ORPHAN_RUN_MS = 6 * 60_000;
const RETRYABLE_CHAT_RUN_STATUSES = [
  "failed",
  "incomplete",
  "cancelled",
  "timed_out",
] as const;

export class ChatMessageIdCollisionError extends Error {
  constructor() {
    super("Chat message ID is already assigned to a different thread or role");
    this.name = "ChatMessageIdCollisionError";
  }
}

export class ChatMessageRunConflictError extends Error {
  constructor() {
    super(
      "Chat message already has an active, completed, or non-retryable run",
    );
    this.name = "ChatMessageRunConflictError";
  }
}

export class ChatThreadIdCollisionError extends Error {
  constructor() {
    super("Chat thread ID is already in use");
    this.name = "ChatThreadIdCollisionError";
  }
}

function getPostgresError(error: unknown) {
  const wrapped = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  return wrapped.cause ?? wrapped;
}

async function repairOrphanedRuns(rows: ChatMessage[]): Promise<void> {
  const cutoff = Date.now() - ORPHAN_RUN_MS;
  const orphaned = rows.filter(
    (m) =>
      m.metadata?.runStatus === "running" &&
      m.createdAt instanceof Date &&
      m.createdAt.getTime() < cutoff,
  );
  if (orphaned.length === 0) return;

  await db
    .update(ChatMessageTable)
    .set({
      metadata: sql`jsonb_set(jsonb_set(coalesce(${ChatMessageTable.metadata}, '{}'::jsonb), '{runStatus}', '"failed"'), '{error}', '{"code":"orphaned","retryable":true}'::jsonb)`,
    })
    .where(
      inArray(
        ChatMessageTable.id,
        orphaned.map((m) => m.id),
      ),
    );

  for (const m of orphaned) {
    m.metadata = {
      ...m.metadata,
      runStatus: "failed",
      error: { code: "orphaned", retryable: true },
    };
  }
}

export const pgChatRepository: ChatRepository = {
  insertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = await db
      .insert(ChatThreadTable)
      .values({
        title: thread.title,
        userId: thread.userId,
        id: thread.id,
        projectId: thread.projectId ?? null,
        knowledgeBases: thread.knowledgeBases ?? [],
      })
      .returning();
    return {
      ...result,
      projectId: result.projectId ?? undefined,
    };
  },

  insertThreadWithFirstMessage: async (
    thread,
    message,
  ): Promise<ChatThread> => {
    if (message.threadId !== thread.id) {
      throw new Error("First message must belong to the new thread");
    }
    if (message.role !== "user") {
      throw new Error("First conversation message must be a user message");
    }

    try {
      return await db.transaction(async (tx) => {
        const [createdThread] = await tx
          .insert(ChatThreadTable)
          .values({
            id: thread.id,
            title: thread.title,
            userId: thread.userId,
            projectId: thread.projectId ?? null,
            knowledgeBases: thread.knowledgeBases ?? [],
          })
          .returning();
        if (!createdThread) {
          throw new Error("Could not create the conversation thread");
        }

        const [insertedMessage] = await tx
          .insert(ChatMessageTable)
          .values({
            ...message,
            threadId: createdThread.id,
            metadata: {
              ...(message.metadata ?? {}),
              runId: message.id,
              runStatus: "failed",
              error: { code: "not_started", retryable: true },
            },
          })
          .returning({ id: ChatMessageTable.id });
        if (!insertedMessage) {
          throw new Error("Could not persist the first conversation message");
        }

        return {
          ...createdThread,
          projectId: createdThread.projectId ?? undefined,
        };
      });
    } catch (error) {
      const postgresError = getPostgresError(error);
      if (
        postgresError.code === "23505" &&
        postgresError.constraint === "chat_message_pkey"
      ) {
        throw new ChatMessageIdCollisionError();
      }
      if (
        postgresError.code === "23505" &&
        postgresError.constraint === "chat_thread_pkey"
      ) {
        throw new ChatThreadIdCollisionError();
      }
      throw error;
    }
  },

  insertThreadWithDefaults: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<
    ChatThread & {
      messages: ChatMessage[];
      userPreferences?: UserPreferences;
    }
  > => {
    // onConflictDoNothing, not a bare insert: the titling request upserts the
    // same thread id concurrently on a brand-new thread, and losing that race
    // used to fail the whole chat POST with a unique violation.
    const [result] = await db
      .insert(ChatThreadTable)
      .values({
        title: thread.title,
        userId: thread.userId,
        id: thread.id,
        projectId: thread.projectId ?? null,
        knowledgeBases: thread.knowledgeBases ?? [],
      })
      .onConflictDoNothing({ target: ChatThreadTable.id })
      .returning();

    if (!result) {
      // Someone else created it in between; read what they wrote.
      const existing = await pgChatRepository.selectThreadDetails(thread.id);
      if (existing) return existing;
      throw new Error(`Failed to create chat thread ${thread.id}`);
    }

    // Return with expected shape - no extra query needed
    // New threads have no messages and no user preferences yet
    return {
      ...result,
      projectId: result.projectId ?? undefined,
      messages: [],
      userPreferences: undefined,
    };
  },

  deleteChatMessage: async (id: string, userId: string): Promise<void> => {
    await db
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
      );
  },

  selectThread: async (id: string): Promise<ChatThread | null> => {
    const [result] = await db
      .select()
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, id));
    if (!result) return null;
    return {
      ...result,
      projectId: result.projectId ?? undefined,
    };
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

    // Only the newest window feeds the model per turn; loading the full thread
    // here de-TOASTs every message's multi-MB parts on every send. The windowed
    // read below also read-repairs orphaned runs (see selectMessagesByThreadId).
    const messages = await pgChatRepository.selectMessagesByThreadId(id, {
      limit: CHAT_MESSAGE_WINDOW,
    });
    return {
      id: thread.chat_thread.id,
      title: thread.chat_thread.title,
      userId: thread.chat_thread.userId,
      projectId: thread.chat_thread.projectId ?? undefined,
      knowledgeBases: thread.chat_thread.knowledgeBases ?? [],
      createdAt: thread.chat_thread.createdAt,
      userPreferences: thread.user?.preferences ?? undefined,
      messages,
    };
  },

  selectMessagesByThreadId: async (
    threadId: string,
    opts?: { limit?: number; beforeMessageId?: string },
  ): Promise<ChatMessage[]> => {
    const { limit, beforeMessageId } = opts ?? {};

    // Resolve the "load older" cursor to a timestamp, scoped to the thread so a
    // message id from another thread can't page across ownership boundaries.
    let before: Date | undefined;
    if (beforeMessageId) {
      const [cursor] = await db
        .select({ createdAt: ChatMessageTable.createdAt })
        .from(ChatMessageTable)
        .where(
          and(
            eq(ChatMessageTable.id, beforeMessageId),
            eq(ChatMessageTable.threadId, threadId),
          ),
        );
      if (!cursor) return [];
      before = cursor.createdAt;
    }

    // No limit → full history in chronological order (export path).
    if (!limit) {
      const result = await db
        .select()
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, threadId))
        .orderBy(ChatMessageTable.createdAt);
      return result as ChatMessage[];
    }

    // Windowed: newest `limit` rows (optionally older than the cursor), fetched
    // descending then reversed so callers still get chronological order.
    // ponytail: createdAt cursor with strict `<`; a same-microsecond tie across
    // the window boundary could skip one row. Upgrade to a (createdAt, id) tuple
    // cursor only if sub-second bursts of messages become real.
    const result = (await db
      .select()
      .from(ChatMessageTable)
      .where(
        before
          ? and(
              eq(ChatMessageTable.threadId, threadId),
              lt(ChatMessageTable.createdAt, before),
            )
          : eq(ChatMessageTable.threadId, threadId),
      )
      .orderBy(desc(ChatMessageTable.createdAt))
      .limit(limit)) as ChatMessage[];

    await repairOrphanedRuns(result);
    return result.reverse();
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
    if (!thread.userId) {
      throw new Error("updateThread requires a userId for ownership scoping");
    }
    const [result] = await db
      .update(ChatThreadTable)
      .set({
        title: thread.title,
      })
      .where(
        and(
          eq(ChatThreadTable.id, id),
          eq(ChatThreadTable.userId, thread.userId),
        ),
      )
      .returning();
    if (!result) {
      throw new Error("Thread not found or access denied");
    }
    return {
      ...result,
      projectId: result.projectId ?? undefined,
    };
  },
  upsertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = await db
      .insert(ChatThreadTable)
      .values({
        ...thread,
        projectId: thread.projectId ?? null,
      })
      .onConflictDoUpdate({
        target: [ChatThreadTable.id],
        set: {
          // Never blank an existing title. A duplicate or failed titling attempt
          // that produced nothing must leave a good title standing.
          title: sql`case when excluded.title = '' then ${ChatThreadTable.title} else excluded.title end`,
        },
      })
      .returning();
    return {
      ...result,
      projectId: result.projectId ?? undefined,
    };
  },

  setThreadKnowledgeBases: async (
    id: string,
    userId: string,
    knowledgeBases: AgentKnowledgeBaseBinding[],
  ): Promise<boolean> => {
    const updated = await db
      .update(ChatThreadTable)
      .set({ knowledgeBases })
      .where(
        and(eq(ChatThreadTable.id, id), eq(ChatThreadTable.userId, userId)),
      )
      .returning({ id: ChatThreadTable.id });
    return updated.length > 0;
  },

  setThreadTitleIfEmpty: async (id: string, title: string): Promise<string> => {
    const trimmed = title.trim();
    if (!trimmed) {
      const [existing] = await db
        .select({ title: ChatThreadTable.title })
        .from(ChatThreadTable)
        .where(eq(ChatThreadTable.id, id));
      return existing?.title ?? "";
    }

    const [updated] = await db
      .update(ChatThreadTable)
      .set({ title: trimmed })
      .where(and(eq(ChatThreadTable.id, id), eq(ChatThreadTable.title, "")))
      .returning({ title: ChatThreadTable.title });
    if (updated) return updated.title;

    // Either the thread is gone or someone titled it first — report what stands.
    const [existing] = await db
      .select({ title: ChatThreadTable.title })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, id));
    return existing?.title ?? "";
  },

  deleteThread: async (id: string): Promise<void> => {
    // chat_message.thread_id is ON DELETE CASCADE (migration 0013), so deleting
    // the thread removes its messages in a single statement. Ownership is
    // enforced by the callers (deleteThreadAction.checkAccess); the bulk
    // variants below carry their own userId predicate.
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
        setWhere: and(
          eq(ChatMessageTable.threadId, message.threadId),
          eq(ChatMessageTable.role, message.role),
        ),
        set: {
          parts: message.parts,
          metadata: message.metadata,
        },
      })
      .returning();
    if (!result[0]) {
      throw new ChatMessageIdCollisionError();
    }
    return result[0] as ChatMessage;
  },

  claimMessageRun: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    if (message.role !== "user") {
      throw new Error("Only a user message can claim a chat run");
    }

    const { error: _previousError, ...priorMetadata } = message.metadata ?? {};
    const runAttemptId = priorMetadata.runAttemptId ?? randomUUID();
    const runningMetadata = {
      ...priorMetadata,
      runId: message.id,
      runAttemptId,
      runStatus: "running" as const,
    };
    const [claimed] = await db
      .insert(ChatMessageTable)
      .values({ ...message, metadata: runningMetadata })
      .onConflictDoUpdate({
        target: [ChatMessageTable.id],
        setWhere: and(
          eq(ChatMessageTable.threadId, message.threadId),
          eq(ChatMessageTable.role, "user"),
          or(
            isNull(sql`${ChatMessageTable.metadata}->>'runStatus'`),
            inArray(sql`${ChatMessageTable.metadata}->>'runStatus'`, [
              ...RETRYABLE_CHAT_RUN_STATUSES,
            ]),
          ),
          sql`COALESCE(${ChatMessageTable.metadata}->'error'->>'retryable', 'true') <> 'false'`,
        ),
        set: { parts: message.parts, metadata: runningMetadata },
      })
      .returning();

    if (claimed) return claimed as ChatMessage;

    const [existing] = await db
      .select({ threadId: ChatMessageTable.threadId })
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.id, message.id))
      .limit(1);
    if (existing && existing.threadId !== message.threadId) {
      throw new ChatMessageIdCollisionError();
    }
    throw new ChatMessageRunConflictError();
  },

  finalizeMessageRun: async (userMessage, assistantMessage): Promise<void> => {
    if (userMessage.role !== "user" || assistantMessage.role !== "assistant") {
      throw new Error("A chat run must finalize a user and assistant message");
    }
    if (userMessage.threadId !== assistantMessage.threadId) {
      throw new Error("Chat run messages must belong to the same thread");
    }
    const runAttemptId = userMessage.metadata?.runAttemptId;
    if (!runAttemptId) throw new ChatMessageRunConflictError();

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(ChatMessageTable)
        .set({ parts: userMessage.parts, metadata: userMessage.metadata })
        .where(
          and(
            eq(ChatMessageTable.id, userMessage.id),
            eq(ChatMessageTable.threadId, userMessage.threadId),
            eq(ChatMessageTable.role, "user"),
            eq(
              sql`${ChatMessageTable.metadata}->>'runAttemptId'`,
              runAttemptId,
            ),
            eq(sql`${ChatMessageTable.metadata}->>'runStatus'`, "running"),
          ),
        )
        .returning({ id: ChatMessageTable.id });
      if (!updated) throw new ChatMessageRunConflictError();

      const [savedAssistant] = await tx
        .insert(ChatMessageTable)
        .values(assistantMessage)
        .onConflictDoNothing({ target: [ChatMessageTable.id] })
        .returning({ id: ChatMessageTable.id });
      if (!savedAssistant) throw new ChatMessageIdCollisionError();
    });
  },

  failMessageRun: async (message): Promise<boolean> => {
    const runAttemptId = message.metadata?.runAttemptId;
    if (!runAttemptId) return false;
    const [failed] = await db
      .update(ChatMessageTable)
      .set({ parts: message.parts, metadata: message.metadata })
      .where(
        and(
          eq(ChatMessageTable.id, message.id),
          eq(ChatMessageTable.threadId, message.threadId),
          eq(ChatMessageTable.role, "user"),
          eq(sql`${ChatMessageTable.metadata}->>'runAttemptId'`, runAttemptId),
          eq(sql`${ChatMessageTable.metadata}->>'runStatus'`, "running"),
        ),
      )
      .returning({ id: ChatMessageTable.id });
    return Boolean(failed);
  },

  deleteMessagesByChatIdAfterTimestamp: async (
    messageId: string,
    userId: string,
  ): Promise<void> => {
    const [message] = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.id, messageId));
    if (!message) {
      return;
    }
    const hasAccess = await pgChatRepository.checkAccess(
      message.threadId,
      userId,
    );
    if (!hasAccess) {
      return;
    }
    // Delete messages that are in the same thread AND created before or at the same time as the target message
    await db
      .delete(ChatMessageTable)
      .where(
        and(
          eq(ChatMessageTable.threadId, message.threadId),
          gte(ChatMessageTable.createdAt, message.createdAt),
        ),
      );
  },

  deleteAllThreads: async (userId: string): Promise<void> => {
    // Single scoped delete; child chat_message rows cascade. Replaces the
    // previous select + per-thread fan-out (3N+1 queries). The userId predicate
    // keeps this to the caller's own threads.
    await db.delete(ChatThreadTable).where(eq(ChatThreadTable.userId, userId));
  },

  deleteUnarchivedThreads: async (userId: string): Promise<void> => {
    // Same bulk delete, scoped to the caller's threads with no project (chat
    // messages cascade). Keeps the userId + null-project ownership predicate.
    await db
      .delete(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.userId, userId),
          isNull(ChatThreadTable.projectId),
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
};
