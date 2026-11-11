import type { ChatMessage } from "app-types/chat";
import type {
  StoredThreadInsights,
  ThreadInsights,
} from "app-types/thread-insights";
import { and, desc, eq, sql } from "drizzle-orm";
import { fingerprintThreadTranscript } from "lib/ai/thread-insights-transcript";
import { pgDb } from "lib/db/pg/db.pg";
import { ChatMessageTable, ChatThreadTable } from "lib/db/pg/schema.pg";

export type ThreadInsightsTranscript = {
  title: string;
  messages: ChatMessage[];
  messageCount: number;
  lastMessageId: string | null;
  transcriptHash: string;
};

export type SaveThreadInsightsResult =
  | { status: "saved"; insights: StoredThreadInsights }
  | { status: "not_found" }
  | { status: "transcript_changed" };

const DEFAULT_MESSAGE_LIMIT = 50;

export const pgThreadInsightsRepository = {
  async loadTranscriptForOwner(
    threadId: string,
    userId: string,
    limit = DEFAULT_MESSAGE_LIMIT,
  ): Promise<ThreadInsightsTranscript | null> {
    return pgDb.transaction(
      async (tx) => {
        const [thread] = await tx
          .select({ title: ChatThreadTable.title })
          .from(ChatThreadTable)
          .where(
            and(
              eq(ChatThreadTable.id, threadId),
              eq(ChatThreadTable.userId, userId),
            ),
          )
          .limit(1);
        if (!thread) return null;

        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(ChatMessageTable)
          .where(eq(ChatMessageTable.threadId, threadId));
        const newestFirst = await tx
          .select()
          .from(ChatMessageTable)
          .where(eq(ChatMessageTable.threadId, threadId))
          .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
          .limit(limit)
          .for("share");
        const messages = newestFirst.reverse() as ChatMessage[];
        return {
          title: thread.title,
          messages,
          messageCount: Number(countRow?.count ?? 0),
          lastMessageId: newestFirst.at(-1)?.id ?? null,
          transcriptHash: fingerprintThreadTranscript(messages),
        };
      },
      { isolationLevel: "repeatable read" },
    );
  },

  async readForOwner(
    threadId: string,
    userId: string,
  ): Promise<StoredThreadInsights | null> {
    const [row] = await pgDb
      .select({
        summary: ChatThreadTable.insightsSummary,
        decisions: ChatThreadTable.insightsDecisions,
        actionItems: ChatThreadTable.insightsActionItems,
        generatedAt: ChatThreadTable.insightsGeneratedAt,
        sourceMessageCount: ChatThreadTable.insightsSourceMessageCount,
        sourceLastMessageId: ChatThreadTable.insightsSourceLastMessageId,
        currentMessageCount: sql<number>`(
          SELECT count(*)::int
          FROM ${ChatMessageTable}
          WHERE ${ChatMessageTable.threadId} = ${ChatThreadTable.id}
        )`,
        currentLastMessageId: sql<string | null>`(
          SELECT ${ChatMessageTable.id}
          FROM ${ChatMessageTable}
          WHERE ${ChatMessageTable.threadId} = ${ChatThreadTable.id}
          ORDER BY ${ChatMessageTable.createdAt} DESC, ${ChatMessageTable.id} DESC
          LIMIT 1
        )`,
      })
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      summary: row.summary ?? "",
      decisions: row.decisions,
      actionItems: row.actionItems,
      generatedAt: row.generatedAt,
      sourceMessageCount: row.sourceMessageCount,
      sourceLastMessageId: row.sourceLastMessageId,
      currentMessageCount: Number(row.currentMessageCount ?? 0),
      currentLastMessageId: row.currentLastMessageId ?? null,
    };
  },

  async saveForOwnerIfTranscriptCurrent(input: {
    threadId: string;
    userId: string;
    expectedLastMessageId: string | null;
    expectedTranscriptHash: string;
    sourceMessageCount: number;
    insights: ThreadInsights;
  }): Promise<SaveThreadInsightsResult> {
    return pgDb.transaction(async (tx) => {
      const [thread] = await tx
        .select({ id: ChatThreadTable.id })
        .from(ChatThreadTable)
        .where(
          and(
            eq(ChatThreadTable.id, input.threadId),
            eq(ChatThreadTable.userId, input.userId),
          ),
        )
        .limit(1)
        .for("update");
      if (!thread) return { status: "not_found" };

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, input.threadId));
      const newestFirst = await tx
        .select()
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, input.threadId))
        .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
        .limit(DEFAULT_MESSAGE_LIMIT)
        .for("share");
      const currentMessages = newestFirst.reverse() as ChatMessage[];
      const latestId = currentMessages.at(-1)?.id ?? null;
      if (
        latestId !== input.expectedLastMessageId ||
        Number(countRow?.count ?? 0) !== input.sourceMessageCount ||
        fingerprintThreadTranscript(currentMessages) !==
          input.expectedTranscriptHash
      ) {
        return { status: "transcript_changed" };
      }

      const generatedAt = new Date();
      const [updated] = await tx
        .update(ChatThreadTable)
        .set({
          insightsSummary: input.insights.summary,
          insightsDecisions: input.insights.decisions,
          insightsActionItems: input.insights.actionItems,
          insightsGeneratedAt: generatedAt,
          insightsSourceMessageCount: input.sourceMessageCount,
          insightsSourceLastMessageId: latestId,
        })
        .where(
          and(
            eq(ChatThreadTable.id, input.threadId),
            eq(ChatThreadTable.userId, input.userId),
          ),
        )
        .returning({ id: ChatThreadTable.id });
      if (!updated) return { status: "not_found" };
      return {
        status: "saved",
        insights: {
          ...input.insights,
          generatedAt,
          sourceMessageCount: input.sourceMessageCount,
          sourceLastMessageId: latestId,
          currentMessageCount: input.sourceMessageCount,
          currentLastMessageId: latestId,
        },
      };
    });
  },
};
