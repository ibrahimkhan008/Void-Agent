import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { CHAT_MESSAGE_WINDOW } from "lib/const";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  ProjectBrainChatSourceTable,
  ProjectBrainRunTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

const MAX_CHAT_SOURCE_CHARS = 60_000;
const CHAT_SOURCE_ENQUEUE_WINDOW_MS = 15 * 60_000;

type TranscriptMessage = {
  role: string;
  parts: unknown;
  metadata?: unknown;
};

export function isCurrentProjectChatBrainRun(input: {
  run: {
    projectId: string;
    requestedByUserId: string;
    chatSourceId: string;
    sourceFingerprint: string;
  };
  source: {
    id: string;
    projectId: string;
    ownerUserId: string;
    activeFingerprint: string | null;
    revokedAt: Date | null;
  };
  thread: { projectId: string | null; userId: string };
}) {
  return (
    input.source.id === input.run.chatSourceId &&
    input.source.projectId === input.run.projectId &&
    input.source.ownerUserId === input.run.requestedByUserId &&
    input.source.activeFingerprint === input.run.sourceFingerprint &&
    input.source.revokedAt === null &&
    input.thread.projectId === input.source.projectId &&
    input.thread.userId === input.source.ownerUserId
  );
}

/** Keep only visible user/assistant text. Tool arguments and attachment metadata stay out. */
export function formatProjectChatTranscript(messages: TranscriptMessage[]) {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const runStatus =
      message.metadata && typeof message.metadata === "object"
        ? (message.metadata as { runStatus?: unknown }).runStatus
        : undefined;
    if (
      message.role === "assistant" &&
      runStatus !== undefined &&
      runStatus !== "completed"
    ) {
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          Boolean(part) &&
          typeof part === "object" &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n");
    if (text)
      lines.push(`${message.role === "user" ? "User" : "Assistant"}: ${text}`);
  }
  const transcript = lines.join("\n\n").trim();
  if (transcript.length <= MAX_CHAT_SOURCE_CHARS) return transcript;
  return `[Earlier chat text omitted; source is bounded to the latest ${MAX_CHAT_SOURCE_CHARS} characters.]\n\n${transcript.slice(-MAX_CHAT_SOURCE_CHARS)}`;
}

/** Chat source owners must still be current project editors to share evidence. */
export async function getActiveProjectBrainChatSourceOwnerIds(
  projectId: string,
) {
  const sources = await pgDb
    .select({
      ownerUserId: ProjectBrainChatSourceTable.ownerUserId,
      threadOwnerId: ChatThreadTable.userId,
    })
    .from(ProjectBrainChatSourceTable)
    .innerJoin(
      ChatThreadTable,
      eq(ChatThreadTable.id, ProjectBrainChatSourceTable.threadId),
    )
    .where(
      and(
        eq(ProjectBrainChatSourceTable.projectId, projectId),
        isNull(ProjectBrainChatSourceTable.revokedAt),
        eq(ChatThreadTable.projectId, projectId),
        eq(ChatThreadTable.userId, ProjectBrainChatSourceTable.ownerUserId),
      ),
    );
  const owners = [...new Set(sources.map((row) => row.ownerUserId))];
  return (
    await Promise.all(
      owners.map(async (ownerUserId) => {
        const access = await getProjectAccess(projectId, ownerUserId);
        return access && mayEditProject(access.role) ? ownerUserId : null;
      }),
    )
  ).filter((id): id is string => Boolean(id));
}

/**
 * Refresh the active chat revision and optionally enqueue it for extraction.
 * The active fingerprint advances even during the 15-minute enqueue window so
 * accepted claims from an edited older revision stop appearing immediately.
 */
export async function refreshProjectBrainChatSource(input: {
  threadId: string;
  userId: string;
  forceEnqueue?: boolean;
}) {
  const [thread] = await pgDb
    .select({
      id: ChatThreadTable.id,
      userId: ChatThreadTable.userId,
      projectId: ChatThreadTable.projectId,
    })
    .from(ChatThreadTable)
    .where(
      and(
        eq(ChatThreadTable.id, input.threadId),
        eq(ChatThreadTable.userId, input.userId),
      ),
    )
    .limit(1);
  if (!thread?.projectId) return { queued: false, reason: "not-project-chat" };

  const access = await getProjectAccess(thread.projectId, input.userId);
  if (!access || !mayEditProject(access.role)) {
    return { queued: false, reason: "project-access-unavailable" };
  }

  const persistedMessages = await pgDb
    .select({
      role: ChatMessageTable.role,
      parts: ChatMessageTable.parts,
      metadata: ChatMessageTable.metadata,
    })
    .from(ChatMessageTable)
    .where(eq(ChatMessageTable.threadId, thread.id))
    .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
    .limit(CHAT_MESSAGE_WINDOW);
  const transcript = formatProjectChatTranscript(persistedMessages.reverse());
  if (!transcript) {
    await pgDb
      .delete(ProjectBrainChatSourceTable)
      .where(
        and(
          eq(ProjectBrainChatSourceTable.projectId, thread.projectId),
          eq(ProjectBrainChatSourceTable.threadId, thread.id),
          eq(ProjectBrainChatSourceTable.ownerUserId, input.userId),
        ),
      );
    return { queued: false, reason: "empty-source-revoked" };
  }

  const sourceFingerprint = projectBrainSourceFingerprint(
    `chat:${thread.id}`,
    transcript,
  );
  const now = new Date();
  let shouldQueue = input.forceEnqueue === true;

  return pgDb.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ProjectBrainChatSourceTable)
      .where(
        and(
          eq(ProjectBrainChatSourceTable.projectId, thread.projectId!),
          eq(ProjectBrainChatSourceTable.threadId, thread.id),
        ),
      )
      .for("update")
      .limit(1);
    if (existing && existing.ownerUserId !== input.userId) {
      return { queued: false, reason: "source-owner-mismatch" };
    }

    if (!shouldQueue) {
      shouldQueue =
        !existing?.lastEnqueuedAt ||
        now.getTime() - existing.lastEnqueuedAt.getTime() >=
          CHAT_SOURCE_ENQUEUE_WINDOW_MS;
    }

    if (shouldQueue) {
      const rate = await checkApiRateLimit({
        kind: "project-brain-ingest",
        id: input.userId,
        limit: 30,
        windowMs: 60 * 60_000,
      });
      if (!rate.allowed) shouldQueue = false;
    }

    let chatSourceId = existing?.id;
    if (!chatSourceId) {
      const [created] = await tx
        .insert(ProjectBrainChatSourceTable)
        .values({
          projectId: thread.projectId!,
          threadId: thread.id,
          ownerUserId: input.userId,
          activeFingerprint: sourceFingerprint,
          lastEnqueuedAt: shouldQueue ? now : null,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            ProjectBrainChatSourceTable.projectId,
            ProjectBrainChatSourceTable.threadId,
          ],
        })
        .returning({ id: ProjectBrainChatSourceTable.id });
      chatSourceId = created?.id;
    }
    if (!chatSourceId) {
      const [concurrent] = await tx
        .select({ id: ProjectBrainChatSourceTable.id })
        .from(ProjectBrainChatSourceTable)
        .where(
          and(
            eq(ProjectBrainChatSourceTable.projectId, thread.projectId!),
            eq(ProjectBrainChatSourceTable.threadId, thread.id),
            eq(ProjectBrainChatSourceTable.ownerUserId, input.userId),
          ),
        )
        .limit(1);
      if (!concurrent) return { queued: false, reason: "source-create-raced" };
      chatSourceId = concurrent.id;
    }

    if (existing?.activeFingerprint !== sourceFingerprint) {
      // Removing old revisions also removes stale accepted/proposed claims and
      // their snapshots, so edits and truncations cannot leave deleted chat in
      // the brain or retained as old source material.
      await tx
        .delete(ProjectBrainSourceVersionTable)
        .where(eq(ProjectBrainSourceVersionTable.chatSourceId, chatSourceId));
    }

    await tx
      .update(ProjectBrainChatSourceTable)
      .set({
        activeFingerprint: sourceFingerprint,
        revokedAt: null,
        lastEnqueuedAt: shouldQueue ? now : (existing?.lastEnqueuedAt ?? null),
        updatedAt: now,
      })
      .where(eq(ProjectBrainChatSourceTable.id, chatSourceId));

    let [version] = await tx
      .select({ id: ProjectBrainSourceVersionTable.id })
      .from(ProjectBrainSourceVersionTable)
      .where(
        and(
          eq(ProjectBrainSourceVersionTable.projectId, thread.projectId!),
          eq(ProjectBrainSourceVersionTable.chatSourceId, chatSourceId),
          eq(
            ProjectBrainSourceVersionTable.sourceFingerprint,
            sourceFingerprint,
          ),
        ),
      )
      .limit(1);
    if (!version) {
      [version] = await tx
        .insert(ProjectBrainSourceVersionTable)
        .values({
          projectId: thread.projectId!,
          sourceType: "chat",
          sourceItemId: null,
          chatSourceId,
          sourceFingerprint,
          contentSnapshot: transcript,
          contentLength: transcript.length,
        })
        .returning({ id: ProjectBrainSourceVersionTable.id });
    }
    if (!shouldQueue || !version) {
      return { queued: false, reason: "enqueue-window-or-rate-limit" };
    }

    const [createdRun] = await tx
      .insert(ProjectBrainRunTable)
      .values({
        projectId: thread.projectId!,
        requestedByUserId: input.userId,
        sourceType: "chat",
        sourceItemId: null,
        chatSourceId,
        sourceVersionId: version.id,
        sourceFingerprint,
        status: "queued",
        attempts: 0,
      })
      .onConflictDoNothing({
        target: [
          ProjectBrainRunTable.projectId,
          ProjectBrainRunTable.sourceFingerprint,
        ],
      })
      .returning({ id: ProjectBrainRunTable.id });
    return {
      queued: Boolean(createdRun),
      reason: createdRun ? "queued" : "duplicate",
    };
  });
}

/** Remove all chat-derived proposals and snapshots when a thread leaves a project. */
export async function revokeProjectBrainChatSource(input: {
  threadId: string;
  projectId: string;
  userId: string;
}) {
  const [thread] = await pgDb
    .select({ id: ChatThreadTable.id, userId: ChatThreadTable.userId })
    .from(ChatThreadTable)
    .where(eq(ChatThreadTable.id, input.threadId))
    .limit(1);
  if (thread && thread.userId !== input.userId) return false;
  await pgDb
    .delete(ProjectBrainChatSourceTable)
    .where(
      and(
        eq(ProjectBrainChatSourceTable.threadId, input.threadId),
        eq(ProjectBrainChatSourceTable.projectId, input.projectId),
        eq(ProjectBrainChatSourceTable.ownerUserId, input.userId),
      ),
    );
  return true;
}
