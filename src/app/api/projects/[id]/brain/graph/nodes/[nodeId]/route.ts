import { getSession } from "auth/server";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import {
  type BrainNodeFact,
  deriveProjectBrainNodeDetail,
} from "lib/projects/brain-graph";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { z } from "zod";

export const dynamic = "force-dynamic";

const nodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const projectIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id: projectId, nodeId: rawNodeId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  const parsedNodeId = nodeIdSchema.safeParse(rawNodeId);
  if (!parsedNodeId.success)
    return Response.json({ error: "Invalid graph node" }, { status: 400 });

  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const collectionIds = access.project.collectionIds;
  if (!collectionIds.length)
    return Response.json(
      { detail: null },
      { headers: { "cache-control": "no-store" } },
    );
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!ownerIds.length)
    return Response.json(
      { detail: null },
      { headers: { "cache-control": "no-store" } },
    );

  const normalizedSubject = sql`lower(trim(regexp_replace(${ProjectBrainFactTable.subject}, '[[:space:]]+', ' ', 'g'))) = ${parsedNodeId.data.toLowerCase()}`;
  const normalizedObject = sql`lower(trim(regexp_replace(${ProjectBrainFactTable.object}, '[[:space:]]+', ' ', 'g'))) = ${parsedNodeId.data.toLowerCase()}`;
  const pageIdFilter = z.string().uuid().safeParse(parsedNodeId.data).success
    ? or(
        eq(ProjectBrainFactTable.subjectPageId, parsedNodeId.data),
        eq(ProjectBrainFactTable.objectPageId, parsedNodeId.data),
      )
    : undefined;
  const rows = await pgDb
    .select({
      id: ProjectBrainFactTable.id,
      subject: ProjectBrainFactTable.subject,
      predicate: ProjectBrainFactTable.predicate,
      object: ProjectBrainFactTable.object,
      reviewStatus: ProjectBrainFactTable.reviewStatus,
      subjectPageId: ProjectBrainFactTable.subjectPageId,
      objectPageId: ProjectBrainFactTable.objectPageId,
      subjectPageTitle: ProjectBrainPageTable.title,
      evidence: ProjectBrainFactTable.evidence,
      confidence: ProjectBrainFactTable.confidence,
      sourceItemId: ProjectBrainFactTable.sourceItemId,
      collectionId: CollectionItemTable.collectionId,
      filename: CollectionItemTable.filename,
      sourceUrl: CollectionItemTable.sourceUrl,
    })
    .from(ProjectBrainFactTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .leftJoin(
      ProjectBrainPageTable,
      eq(ProjectBrainPageTable.id, ProjectBrainFactTable.subjectPageId),
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
        ne(ProjectBrainFactTable.reviewStatus, "rejected"),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
        pageIdFilter
          ? or(sql`(${normalizedSubject} OR ${normalizedObject})`, pageIdFilter)
          : sql`(${normalizedSubject} OR ${normalizedObject})`,
      ),
    )
    .orderBy(desc(ProjectBrainFactTable.createdAt))
    .limit(500);

  const detail = deriveProjectBrainNodeDetail(
    parsedNodeId.data,
    rows as BrainNodeFact[],
  );
  return Response.json(
    { detail },
    { headers: { "cache-control": "no-store" } },
  );
}
