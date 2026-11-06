import { getSession } from "auth/server";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId, versionId } = await params;
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(versionId).success
  ) {
    return new Response("Not found", { status: 404 });
  }
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-source-version",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length)
    return new Response("Not found", { status: 404 });

  try {
    const [revision] = await pgDb
      .select({
        content: ProjectBrainSourceVersionTable.contentSnapshot,
        contentLength: ProjectBrainSourceVersionTable.contentLength,
        sourceItemId: ProjectBrainSourceVersionTable.sourceItemId,
        sourceFingerprint: ProjectBrainSourceVersionTable.sourceFingerprint,
      })
      .from(ProjectBrainSourceVersionTable)
      .innerJoin(
        CollectionItemTable,
        eq(CollectionItemTable.id, ProjectBrainSourceVersionTable.sourceItemId),
      )
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(
        and(
          eq(ProjectBrainSourceVersionTable.id, versionId),
          eq(ProjectBrainSourceVersionTable.projectId, projectId),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .limit(1);
    if (!revision?.content)
      return new Response("Source revision not found", { status: 404 });
    if (
      revision.content.length > 60_000 ||
      revision.content.length !== revision.contentLength ||
      projectBrainSourceFingerprint(revision.sourceItemId, revision.content) !==
        revision.sourceFingerprint
    ) {
      return new Response("Source revision not found", { status: 404 });
    }
    return Response.json(
      { content: revision.content, contentLength: revision.contentLength },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load source revision" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
