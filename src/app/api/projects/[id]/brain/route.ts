import { createHash } from "node:crypto";
import { getSession } from "auth/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ChatThreadTable,
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  ProjectBrainChatSourceTable,
  ProjectBrainFactTable,
  ProjectBrainRunTable,
  ProjectBrainSourceVersionTable,
  ProjectBrainTodoTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { isProjectBrainRunRecoverable } from "lib/projects/brain-schema";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { consolidateProjectBrainTodos } from "lib/projects/consolidate-brain-todos";
import { getActiveProjectBrainChatSourceOwnerIds } from "lib/projects/project-chat-brain-source";
import { ensureProjectBrainSourceVersion } from "lib/projects/source-versions";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({ itemId: z.string().uuid() });
const MAX_SOURCE_CHARS = 60_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  // Document-backed facts and run metadata stay within the current project,
  // collection, and owner visibility boundary. Chat-backed records are queried
  // separately below after checking that their owners remain project editors.
  const hasVisibleSources = collectionIds.length > 0 && ownerIds.length > 0;
  const [runs, facts, sourceRows, sourceVersions, todos] = await Promise.all([
    hasVisibleSources
      ? pgDb
          .select({
            id: ProjectBrainRunTable.id,
            sourceItemId: ProjectBrainRunTable.sourceItemId,
            status: ProjectBrainRunTable.status,
            attempts: ProjectBrainRunTable.attempts,
            factCount: ProjectBrainRunTable.factCount,
            errorMessage: ProjectBrainRunTable.errorMessage,
            createdAt: ProjectBrainRunTable.createdAt,
            updatedAt: ProjectBrainRunTable.updatedAt,
          })
          .from(ProjectBrainRunTable)
          .innerJoin(
            CollectionItemTable,
            eq(CollectionItemTable.id, ProjectBrainRunTable.sourceItemId),
          )
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          )
          .where(
            and(
              eq(ProjectBrainRunTable.projectId, projectId),
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
              eq(CollectionItemTable.status, "ready"),
            ),
          )
          .orderBy(desc(ProjectBrainRunTable.createdAt))
          .limit(30)
      : Promise.resolve([]),
    hasVisibleSources
      ? pgDb
          .select({ fact: ProjectBrainFactTable })
          .from(ProjectBrainFactTable)
          .innerJoin(
            CollectionItemTable,
            eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
          )
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          )
          .where(
            and(
              eq(ProjectBrainFactTable.projectId, projectId),
              projectBrainRunIsActiveSourceRevision(
                ProjectBrainFactTable.runId,
                ProjectBrainFactTable.projectId,
                ProjectBrainFactTable.sourceItemId,
                ProjectBrainFactTable.chatSourceId,
              ),
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
              eq(CollectionItemTable.status, "ready"),
            ),
          )
          .orderBy(desc(ProjectBrainFactTable.createdAt))
          .limit(100)
          .then((rows) => rows.map(({ fact }) => fact))
      : Promise.resolve([]),
    collectionIds.length && ownerIds.length
      ? pgDb
          .select({
            itemId: CollectionItemTable.id,
            collectionId: CollectionItemTable.collectionId,
            filename: CollectionItemTable.filename,
            sourceUrl: CollectionItemTable.sourceUrl,
            status: CollectionItemTable.status,
            createdAt: CollectionItemTable.createdAt,
          })
          .from(CollectionItemTable)
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          )
          .where(
            and(
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
            ),
          )
          .orderBy(desc(CollectionItemTable.createdAt))
          .limit(100)
      : Promise.resolve([]),
    collectionIds.length && ownerIds.length
      ? pgDb
          .select({
            id: ProjectBrainSourceVersionTable.id,
            sourceItemId: ProjectBrainSourceVersionTable.sourceItemId,
            contentLength: ProjectBrainSourceVersionTable.contentLength,
            snapshotAvailable: sql<boolean>`${ProjectBrainSourceVersionTable.contentSnapshot} IS NOT NULL`,
            createdAt: ProjectBrainSourceVersionTable.createdAt,
          })
          .from(ProjectBrainSourceVersionTable)
          .innerJoin(
            CollectionItemTable,
            eq(
              CollectionItemTable.id,
              ProjectBrainSourceVersionTable.sourceItemId,
            ),
          )
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          )
          .where(
            and(
              eq(ProjectBrainSourceVersionTable.projectId, projectId),
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
            ),
          )
          .orderBy(desc(ProjectBrainSourceVersionTable.createdAt))
          .limit(200)
      : Promise.resolve([]),
    hasVisibleSources
      ? pgDb
          .select({
            id: ProjectBrainTodoTable.id,
            sourceItemId: ProjectBrainTodoTable.sourceItemId,
            chatSourceId: ProjectBrainTodoTable.chatSourceId,
            sourceVersionId: ProjectBrainRunTable.sourceVersionId,
            sourceLabel: CollectionItemTable.filename,
            title: ProjectBrainTodoTable.title,
            details: ProjectBrainTodoTable.details,
            evidence: ProjectBrainTodoTable.evidence,
            dueDate: ProjectBrainTodoTable.dueDate,
            status: ProjectBrainTodoTable.status,
            createdAt: ProjectBrainTodoTable.createdAt,
            reviewedAt: ProjectBrainTodoTable.reviewedAt,
          })
          .from(ProjectBrainTodoTable)
          .innerJoin(
            ProjectBrainRunTable,
            eq(ProjectBrainRunTable.id, ProjectBrainTodoTable.runId),
          )
          .innerJoin(
            CollectionItemTable,
            eq(CollectionItemTable.id, ProjectBrainTodoTable.sourceItemId),
          )
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          )
          .where(
            and(
              eq(ProjectBrainTodoTable.projectId, projectId),
              projectBrainRunIsActiveSourceRevision(
                ProjectBrainTodoTable.runId,
                ProjectBrainTodoTable.projectId,
                ProjectBrainTodoTable.sourceItemId,
                ProjectBrainTodoTable.chatSourceId,
              ),
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
              eq(CollectionItemTable.status, "ready"),
            ),
          )
          .orderBy(desc(ProjectBrainTodoTable.createdAt))
          .limit(100)
      : Promise.resolve([]),
  ]);

  const chatOwnerIds = await getActiveProjectBrainChatSourceOwnerIds(projectId);
  const chatSources = chatOwnerIds.length
    ? await pgDb
        .select({
          id: ProjectBrainChatSourceTable.id,
          threadId: ProjectBrainChatSourceTable.threadId,
          title: ChatThreadTable.title,
          activeFingerprint: ProjectBrainChatSourceTable.activeFingerprint,
          updatedAt: ProjectBrainChatSourceTable.updatedAt,
        })
        .from(ProjectBrainChatSourceTable)
        .innerJoin(
          ChatThreadTable,
          eq(ChatThreadTable.id, ProjectBrainChatSourceTable.threadId),
        )
        .where(
          and(
            eq(ProjectBrainChatSourceTable.projectId, projectId),
            inArray(ProjectBrainChatSourceTable.ownerUserId, chatOwnerIds),
            isNull(ProjectBrainChatSourceTable.revokedAt),
            eq(ChatThreadTable.projectId, projectId),
            eq(ChatThreadTable.userId, ProjectBrainChatSourceTable.ownerUserId),
          ),
        )
        .orderBy(desc(ProjectBrainChatSourceTable.updatedAt))
        .limit(100)
    : [];
  const chatSourceIds = chatSources.map((source) => source.id);
  const [chatRuns, chatFacts, chatSourceVersions, chatTodos] =
    chatSourceIds.length
      ? await Promise.all([
          pgDb
            .select({
              id: ProjectBrainRunTable.id,
              sourceItemId: ProjectBrainRunTable.sourceItemId,
              chatSourceId: ProjectBrainRunTable.chatSourceId,
              sourceType: ProjectBrainRunTable.sourceType,
              status: ProjectBrainRunTable.status,
              attempts: ProjectBrainRunTable.attempts,
              factCount: ProjectBrainRunTable.factCount,
              errorMessage: ProjectBrainRunTable.errorMessage,
              createdAt: ProjectBrainRunTable.createdAt,
              updatedAt: ProjectBrainRunTable.updatedAt,
            })
            .from(ProjectBrainRunTable)
            .innerJoin(
              ProjectBrainChatSourceTable,
              eq(
                ProjectBrainChatSourceTable.id,
                ProjectBrainRunTable.chatSourceId,
              ),
            )
            .innerJoin(
              ChatThreadTable,
              eq(ChatThreadTable.id, ProjectBrainChatSourceTable.threadId),
            )
            .where(
              and(
                eq(ProjectBrainRunTable.projectId, projectId),
                eq(ProjectBrainRunTable.sourceType, "chat"),
                inArray(ProjectBrainRunTable.chatSourceId, chatSourceIds),
                eq(
                  ProjectBrainChatSourceTable.activeFingerprint,
                  ProjectBrainRunTable.sourceFingerprint,
                ),
                isNull(ProjectBrainChatSourceTable.revokedAt),
                eq(ChatThreadTable.projectId, projectId),
                eq(
                  ChatThreadTable.userId,
                  ProjectBrainChatSourceTable.ownerUserId,
                ),
              ),
            )
            .orderBy(desc(ProjectBrainRunTable.createdAt))
            .limit(30),
          pgDb
            .select({ fact: ProjectBrainFactTable })
            .from(ProjectBrainFactTable)
            .innerJoin(
              ProjectBrainChatSourceTable,
              eq(
                ProjectBrainChatSourceTable.id,
                ProjectBrainFactTable.chatSourceId,
              ),
            )
            .innerJoin(
              ChatThreadTable,
              eq(ChatThreadTable.id, ProjectBrainChatSourceTable.threadId),
            )
            .where(
              and(
                eq(ProjectBrainFactTable.projectId, projectId),
                eq(ProjectBrainFactTable.sourceType, "chat"),
                inArray(ProjectBrainFactTable.chatSourceId, chatSourceIds),
                projectBrainRunIsActiveSourceRevision(
                  ProjectBrainFactTable.runId,
                  ProjectBrainFactTable.projectId,
                  ProjectBrainFactTable.sourceItemId,
                  ProjectBrainFactTable.chatSourceId,
                ),
                eq(ChatThreadTable.projectId, projectId),
                eq(
                  ChatThreadTable.userId,
                  ProjectBrainChatSourceTable.ownerUserId,
                ),
              ),
            )
            .orderBy(desc(ProjectBrainFactTable.createdAt))
            .limit(100)
            .then((rows) => rows.map(({ fact }) => fact)),
          pgDb
            .select({
              id: ProjectBrainSourceVersionTable.id,
              sourceItemId: ProjectBrainSourceVersionTable.sourceItemId,
              chatSourceId: ProjectBrainSourceVersionTable.chatSourceId,
              sourceType: ProjectBrainSourceVersionTable.sourceType,
              contentLength: ProjectBrainSourceVersionTable.contentLength,
              snapshotAvailable: sql<boolean>`${ProjectBrainSourceVersionTable.contentSnapshot} IS NOT NULL`,
              createdAt: ProjectBrainSourceVersionTable.createdAt,
            })
            .from(ProjectBrainSourceVersionTable)
            .innerJoin(
              ProjectBrainChatSourceTable,
              eq(
                ProjectBrainChatSourceTable.id,
                ProjectBrainSourceVersionTable.chatSourceId,
              ),
            )
            .where(
              and(
                eq(ProjectBrainSourceVersionTable.projectId, projectId),
                eq(ProjectBrainSourceVersionTable.sourceType, "chat"),
                inArray(
                  ProjectBrainSourceVersionTable.chatSourceId,
                  chatSourceIds,
                ),
                eq(
                  ProjectBrainChatSourceTable.activeFingerprint,
                  ProjectBrainSourceVersionTable.sourceFingerprint,
                ),
                isNull(ProjectBrainChatSourceTable.revokedAt),
              ),
            )
            .orderBy(desc(ProjectBrainSourceVersionTable.createdAt))
            .limit(200),
          pgDb
            .select({
              id: ProjectBrainTodoTable.id,
              sourceItemId: ProjectBrainTodoTable.sourceItemId,
              chatSourceId: ProjectBrainTodoTable.chatSourceId,
              sourceVersionId: ProjectBrainRunTable.sourceVersionId,
              sourceLabel: ChatThreadTable.title,
              title: ProjectBrainTodoTable.title,
              details: ProjectBrainTodoTable.details,
              evidence: ProjectBrainTodoTable.evidence,
              dueDate: ProjectBrainTodoTable.dueDate,
              status: ProjectBrainTodoTable.status,
              createdAt: ProjectBrainTodoTable.createdAt,
              reviewedAt: ProjectBrainTodoTable.reviewedAt,
            })
            .from(ProjectBrainTodoTable)
            .innerJoin(
              ProjectBrainRunTable,
              eq(ProjectBrainRunTable.id, ProjectBrainTodoTable.runId),
            )
            .innerJoin(
              ProjectBrainChatSourceTable,
              eq(
                ProjectBrainChatSourceTable.id,
                ProjectBrainTodoTable.chatSourceId,
              ),
            )
            .innerJoin(
              ChatThreadTable,
              eq(ChatThreadTable.id, ProjectBrainChatSourceTable.threadId),
            )
            .where(
              and(
                eq(ProjectBrainTodoTable.projectId, projectId),
                eq(ProjectBrainTodoTable.sourceType, "chat"),
                inArray(ProjectBrainTodoTable.chatSourceId, chatSourceIds),
                projectBrainRunIsActiveSourceRevision(
                  ProjectBrainTodoTable.runId,
                  ProjectBrainTodoTable.projectId,
                  ProjectBrainTodoTable.sourceItemId,
                  ProjectBrainTodoTable.chatSourceId,
                ),
                eq(ChatThreadTable.projectId, projectId),
                eq(
                  ChatThreadTable.userId,
                  ProjectBrainChatSourceTable.ownerUserId,
                ),
              ),
            )
            .orderBy(desc(ProjectBrainTodoTable.createdAt))
            .limit(100),
        ])
      : [[], [], [], []];

  const allRuns = [...runs, ...chatRuns];
  const allFacts = [...facts, ...chatFacts];
  const allSourceVersions = [...sourceVersions, ...chatSourceVersions];
  const allTodos = [...todos, ...chatTodos];
  const consolidatedTodos = consolidateProjectBrainTodos(
    allTodos
      .filter(
        (todo) => todo.status === "accepted" || todo.status === "completed",
      )
      .map((todo) => ({
        ...todo,
        sourceItemId: todo.sourceItemId ?? todo.chatSourceId ?? "",
      })),
  );

  return Response.json(
    {
      runs: allRuns,
      facts: allFacts,
      sources: sourceRows,
      chatSources,
      sourceVersions: allSourceVersions,
      todos: allTodos,
      consolidatedTodos,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return Response.json({ error: "Invalid source" }, { status: 400 });
  if (!access.project.collectionIds.length) {
    return Response.json(
      { error: "Attach a knowledge collection first" },
      { status: 409 },
    );
  }

  const rateLimit = await checkApiRateLimit({
    kind: "project-brain",
    id: session.user.id,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many source analyses. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const documents = await pgDb
    .select({
      itemId: CollectionItemTable.id,
      content: DocumentTable.content,
    })
    .from(CollectionItemTable)
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .innerJoin(
      DocumentTable,
      eq(DocumentTable.collectionItemId, CollectionItemTable.id),
    )
    .where(
      and(
        eq(CollectionItemTable.id, parsed.data.itemId),
        inArray(CollectionItemTable.collectionId, access.project.collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .orderBy(DocumentTable.createdAt)
    .limit(30);

  const sourceText = documents
    .map((document) => document.content ?? "")
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_SOURCE_CHARS);
  if (!documents.length || !sourceText.trim()) {
    return new Response(
      "Source not found in this project's attached collections",
      {
        status: 404,
      },
    );
  }

  const sourceFingerprint = createHash("sha256")
    .update(parsed.data.itemId)
    .update("\0")
    .update(sourceText)
    .digest("hex");

  const runState = await pgDb.transaction(async (tx) => {
    const sourceVersionId = await ensureProjectBrainSourceVersion(tx, {
      projectId,
      sourceItemId: parsed.data.itemId,
      sourceFingerprint,
      contentSnapshot: sourceText,
    });
    const [created] = await tx
      .insert(ProjectBrainRunTable)
      .values({
        projectId,
        requestedByUserId: session.user.id,
        sourceItemId: parsed.data.itemId,
        sourceVersionId,
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
      .returning();
    if (created) return { run: created, shouldAnalyze: true };

    const [existing] = await tx
      .select()
      .from(ProjectBrainRunTable)
      .where(
        and(
          eq(ProjectBrainRunTable.projectId, projectId),
          eq(ProjectBrainRunTable.sourceFingerprint, sourceFingerprint),
        ),
      )
      .for("update");
    if (!existing) throw new Error("Analysis run could not be reserved");
    if (!isProjectBrainRunRecoverable(existing.status, existing.updatedAt)) {
      return { run: existing, shouldAnalyze: false };
    }
    const [retried] = await tx
      .update(ProjectBrainRunTable)
      .set({
        status: "queued",
        attempts: existing.attempts,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(ProjectBrainRunTable.id, existing.id))
      .returning();
    return { run: retried, shouldAnalyze: true };
  });

  if (!runState.shouldAnalyze) {
    return Response.json(
      { runId: runState.run.id, status: runState.run.status, reused: true },
      {
        status:
          runState.run.status === "running" || runState.run.status === "queued"
            ? 202
            : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return Response.json(
    { runId: runState.run.id, status: "queued", reused: false },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
