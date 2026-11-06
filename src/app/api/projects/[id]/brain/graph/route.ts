import { getSession } from "auth/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainContradictionTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import {
  deriveProjectBrainGraph,
  findPotentialProjectBrainContradictions,
  findProjectBrainExperts,
  findProjectBrainShortestPath,
  normalizeProjectBrainNodeId,
  traverseProjectBrainGraph,
} from "lib/projects/brain-graph";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { z } from "zod";

export const dynamic = "force-dynamic";

const focusSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const projectIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  const url = new URL(request.url);
  const rawFocus = url.searchParams.get("focus");
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const rawWhoKnows = url.searchParams.get("whoKnows");
  if ((rawFrom === null) !== (rawTo === null)) {
    return Response.json(
      { error: "Both graph path endpoints are required" },
      { status: 400 },
    );
  }
  const parsedFrom = rawFrom === null ? null : focusSchema.safeParse(rawFrom);
  const parsedTo = rawTo === null ? null : focusSchema.safeParse(rawTo);
  const parsedWhoKnows =
    rawWhoKnows === null ? null : focusSchema.safeParse(rawWhoKnows);
  if ((parsedFrom && !parsedFrom.success) || (parsedTo && !parsedTo.success)) {
    return Response.json(
      { error: "Invalid graph path endpoint" },
      { status: 400 },
    );
  }
  if (parsedWhoKnows && !parsedWhoKnows.success) {
    return Response.json(
      { error: "Invalid expert routing query" },
      { status: 400 },
    );
  }
  const parsedFocus =
    rawFocus === null ? null : focusSchema.safeParse(rawFocus);
  if (parsedFocus && !parsedFocus.success) {
    return Response.json({ error: "Invalid graph focus" }, { status: 400 });
  }
  const parsedDepth = Number(url.searchParams.get("depth") ?? "2");
  const depth = Number.isFinite(parsedDepth)
    ? Math.max(1, Math.min(Math.floor(parsedDepth), 3))
    : 2;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const collectionIds = access.project.collectionIds;
  if (!collectionIds.length) {
    if (parsedWhoKnows?.success)
      return Response.json(
        { experts: [] },
        { headers: { "cache-control": "no-store" } },
      );
    if (parsedFrom?.success && parsedTo?.success)
      return Response.json(
        { path: { nodes: [], edges: [] } },
        { headers: { "cache-control": "no-store" } },
      );
    return Response.json(
      { nodes: [], edges: [], contradictions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!ownerIds.length) {
    if (parsedWhoKnows?.success)
      return Response.json(
        { experts: [] },
        { headers: { "cache-control": "no-store" } },
      );
    if (parsedFrom?.success && parsedTo?.success)
      return Response.json(
        { path: { nodes: [], edges: [] } },
        { headers: { "cache-control": "no-store" } },
      );
    return Response.json(
      { nodes: [], edges: [], contradictions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const facts = await pgDb
    .select({
      id: ProjectBrainFactTable.id,
      subject: ProjectBrainFactTable.subject,
      predicate: ProjectBrainFactTable.predicate,
      object: ProjectBrainFactTable.object,
      reviewStatus: ProjectBrainFactTable.reviewStatus,
      subjectPageId: ProjectBrainFactTable.subjectPageId,
      objectPageId: ProjectBrainFactTable.objectPageId,
      evidence: ProjectBrainFactTable.evidence,
      confidence: ProjectBrainFactTable.confidence,
      sourceItemId: ProjectBrainFactTable.sourceItemId,
      filename: CollectionItemTable.filename,
      sourceUrl: CollectionItemTable.sourceUrl,
      sourceCollectionId: CollectionItemTable.collectionId,
      sourceOwnerId: CollectionTable.userId,
      sourceStatus: CollectionItemTable.status,
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
    .where(
      and(
        eq(ProjectBrainFactTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
        ),
        ne(ProjectBrainFactTable.reviewStatus, "rejected"),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .orderBy(desc(ProjectBrainFactTable.createdAt))
    .limit(500);

  const visibleFacts = facts.filter(
    (fact) =>
      fact.sourceStatus === "ready" &&
      collectionIds.includes(fact.sourceCollectionId) &&
      ownerIds.includes(fact.sourceOwnerId),
  );
  const pageIds = [
    ...new Set(
      visibleFacts
        .flatMap((fact) => [fact.subjectPageId, fact.objectPageId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const pages = pageIds.length
    ? await pgDb
        .select({
          id: ProjectBrainPageTable.id,
          title: ProjectBrainPageTable.title,
        })
        .from(ProjectBrainPageTable)
        .where(
          and(
            eq(ProjectBrainPageTable.projectId, projectId),
            inArray(ProjectBrainPageTable.id, pageIds),
          ),
        )
    : [];
  const pageTitles = new Map(pages.map((page) => [page.id, page.title]));
  const graphFacts = visibleFacts.map(
    ({
      id,
      subject,
      predicate,
      object,
      reviewStatus,
      subjectPageId,
      objectPageId,
    }) => ({
      id,
      subject,
      predicate,
      object,
      reviewStatus,
      subjectPageId,
      objectPageId,
      subjectPageTitle: subjectPageId
        ? (pageTitles.get(subjectPageId) ?? null)
        : null,
      objectPageTitle: objectPageId
        ? (pageTitles.get(objectPageId) ?? null)
        : null,
    }),
  );
  const factById = new Map(visibleFacts.map((fact) => [fact.id, fact]));
  const storedContradictions = await pgDb
    .select()
    .from(ProjectBrainContradictionTable)
    .where(and(eq(ProjectBrainContradictionTable.projectId, projectId)))
    .orderBy(desc(ProjectBrainContradictionTable.updatedAt))
    .limit(100);
  const visibleConflictRecords = storedContradictions.filter(
    (conflict) =>
      factById.has(conflict.factIdA) && factById.has(conflict.factIdB),
  );
  const reviewedContradictions = visibleConflictRecords.flatMap((conflict) => {
    if (conflict.status !== "open" || conflict.verdict !== "contradiction")
      return [];
    const first = factById.get(conflict.factIdA);
    const second = factById.get(conflict.factIdB);
    return first && second
      ? [{ id: conflict.id, first, second, explanation: conflict.explanation }]
      : [];
  });
  const closedConflictPairs = new Set(
    visibleConflictRecords
      .filter((conflict) => conflict.status !== "open")
      .map((conflict) => `${conflict.factIdA}\u0000${conflict.factIdB}`),
  );
  if (parsedWhoKnows?.success) {
    const experts = findProjectBrainExperts(
      visibleFacts.map((fact) => ({
        id: fact.id,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        reviewStatus: fact.reviewStatus,
        evidence: fact.evidence,
        confidence: Number(fact.confidence),
        sourceItemId: fact.sourceItemId,
        collectionId: fact.sourceCollectionId,
        filename: fact.filename,
        sourceUrl: fact.sourceUrl,
      })),
      parsedWhoKnows.data,
    );
    return Response.json(
      { experts },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (parsedFrom?.success && parsedTo?.success) {
    const path = findProjectBrainShortestPath(graphFacts, {
      from: parsedFrom.data,
      to: parsedTo.data,
      maxDepth: 6,
      nodeLimit: 200,
    });
    return Response.json(
      { path },
      { headers: { "cache-control": "no-store" } },
    );
  }
  let graph:
    | ReturnType<typeof deriveProjectBrainGraph>
    | ReturnType<typeof traverseProjectBrainGraph>;
  if (parsedFocus?.success) {
    graph = traverseProjectBrainGraph(graphFacts, {
      focus: normalizeProjectBrainNodeId(parsedFocus.data),
      depth,
      limit: 200,
    });
  } else {
    graph = deriveProjectBrainGraph(graphFacts);
  }

  return Response.json(
    {
      ...graph,
      contradictions: findPotentialProjectBrainContradictions(
        graphFacts,
      ).filter(({ first, second }) => {
        const [factIdA, factIdB] = [first.id, second.id].sort();
        return !closedConflictPairs.has(`${factIdA}\u0000${factIdB}`);
      }),
      reviewedContradictions,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
