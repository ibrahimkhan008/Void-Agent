import { getSession } from "auth/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ChatThreadTable,
  CollectionItemTable,
  CollectionTable,
  ProjectBrainChatSourceTable,
  ProjectBrainFactTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { getActiveProjectBrainChatSourceOwnerIds } from "lib/projects/project-chat-brain-source";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const reviewSchema = z.object({ status: z.enum(["accepted", "rejected"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { id: projectId, factId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid review status" }, { status: 400 });

  const chatOwnerIds = await getActiveProjectBrainChatSourceOwnerIds(projectId);
  const chatSources = chatOwnerIds.length
    ? await pgDb
        .select({ id: ProjectBrainChatSourceTable.id })
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
    : [];
  const chatSourceIds = chatSources.map((source) => source.id);
  const [chatFact] = chatSourceIds.length
    ? await pgDb
        .update(ProjectBrainFactTable)
        .set({ reviewStatus: parsed.data.status, reviewedAt: new Date() })
        .where(
          and(
            eq(ProjectBrainFactTable.id, factId),
            eq(ProjectBrainFactTable.projectId, projectId),
            eq(ProjectBrainFactTable.sourceType, "chat"),
            eq(ProjectBrainFactTable.reviewStatus, "proposed"),
            inArray(ProjectBrainFactTable.chatSourceId, chatSourceIds),
            projectBrainRunIsActiveSourceRevision(
              ProjectBrainFactTable.runId,
              ProjectBrainFactTable.projectId,
              ProjectBrainFactTable.sourceItemId,
              ProjectBrainFactTable.chatSourceId,
            ),
          ),
        )
        .returning()
    : [];
  if (chatFact) return Response.json({ fact: chatFact });

  const [reviewedChatFact] = chatSourceIds.length
    ? await pgDb
        .select({ id: ProjectBrainFactTable.id })
        .from(ProjectBrainFactTable)
        .where(
          and(
            eq(ProjectBrainFactTable.id, factId),
            eq(ProjectBrainFactTable.projectId, projectId),
            eq(ProjectBrainFactTable.sourceType, "chat"),
            inArray(ProjectBrainFactTable.chatSourceId, chatSourceIds),
            projectBrainRunIsActiveSourceRevision(
              ProjectBrainFactTable.runId,
              ProjectBrainFactTable.projectId,
              ProjectBrainFactTable.sourceItemId,
              ProjectBrainFactTable.chatSourceId,
            ),
          ),
        )
    : [];
  if (reviewedChatFact) {
    return Response.json(
      { error: "Fact was already reviewed" },
      { status: 409 },
    );
  }

  const ownerIds = await getProjectCollectionOwnerIds(access);
  if (!access.project.collectionIds.length || !ownerIds.length) {
    return new Response("Not found", { status: 404 });
  }
  const sourceScope = access.project.teamId
    ? or(
        and(
          isNull(CollectionTable.orgId),
          inArray(CollectionTable.userId, ownerIds),
        ),
        eq(CollectionTable.orgId, access.project.teamId),
      )
    : and(
        isNull(CollectionTable.orgId),
        inArray(CollectionTable.userId, ownerIds),
      );
  const visibleSource = and(
    inArray(CollectionItemTable.collectionId, access.project.collectionIds),
    sourceScope,
    eq(CollectionItemTable.status, "ready"),
  );

  const [fact] = await pgDb
    .update(ProjectBrainFactTable)
    .set({ reviewStatus: parsed.data.status, reviewedAt: new Date() })
    .from(CollectionItemTable)
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainFactTable.id, factId),
        eq(ProjectBrainFactTable.projectId, projectId),
        eq(ProjectBrainFactTable.reviewStatus, "proposed"),
        eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
        visibleSource,
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
        ),
      ),
    )
    .returning();
  if (fact) return Response.json({ fact });

  const [existing] = await pgDb
    .select({ id: ProjectBrainFactTable.id })
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
        eq(ProjectBrainFactTable.id, factId),
        eq(ProjectBrainFactTable.projectId, projectId),
        visibleSource,
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
        ),
      ),
    );
  return existing
    ? Response.json({ error: "Fact was already reviewed" }, { status: 409 })
    : new Response("Not found", { status: 404 });
}
